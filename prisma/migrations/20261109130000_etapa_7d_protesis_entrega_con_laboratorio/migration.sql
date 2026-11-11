-- Prótesis, arreglos de la revisión (2026-11-09): no se entrega sin
-- laboratorio si el técnico lleva parte, y una segunda barrera en la base
-- para los abonos. Escrita a mano en el estilo de `etapa_7_protesis`; no
-- toca 7, 7b ni 7c (pueden estar aplicadas).
--
-- Lo que cambia:
--   1. protesis_entrega_con_laboratorio_check (CHECK nuevo): una prótesis
--      entregada tiene laboratorio, salvo que su regla congelada no le dé
--      nada al técnico (`pbTecnico` = 0). Sin esto la parte del técnico de
--      una entregada sin laboratorio quedaba perdida: "Por pagar al
--      laboratorio" agrupa por laboratorio (lib/pagos-al-laboratorio.ts) y
--      una entregada ya no cambia (`protesis_congelada`), así que no se le
--      podía asignar uno después. La aplicación lo pide antes
--      (`editarProtesis`, lib/protesis-servidor.ts: 400 "Asigna el
--      laboratorio antes de entregar: se le debe su parte").
--   2. atencion_servicios_reparto_de_protesis (CREATE OR REPLACE): todo lo de
--      las etapas 7 y 7b, igual, más tres reglas de un abono (línea con
--      `protesisId`):
--        a. Al agregarlo (o si cambia de atención o de prótesis), la
--           prótesis es del mismo paciente que la atención.
--        b. Al agregarlo (o si cambia de prótesis, de `byOwner` o de
--           `memberId` a otro miembro), va a nombre de la tratante de la
--           prótesis: `byOwner` igual al de la prótesis y `memberId` el de
--           la prótesis (null si la tratante es la dueña). Pasar `memberId` a
--           null sigue permitido: es desvincular al miembro para borrarlo
--           (el `ON DELETE SET NULL` de la línea), como en `protesis_congelada`.
--        c. Al entrar a una liquidación (`liquidacionId` pasa a otro valor no
--           null), la prótesis está entregada y la línea es de la tratante:
--           `memberId` igual al de la prótesis (no null) y `byOwner` igual.
--      Hoy lo cumple la aplicación (`agregarAbono`, lib/abonos-de-protesis.ts;
--      `abonosLiberadosDe`, lib/liquidacion.ts): ésta es la segunda barrera,
--      porque no hay RLS detrás (CLAUDE.md, regla 5). Es un trigger: mira
--      lo que se escribe desde ahora, no revisa las filas que ya existen.
--
-- Filas existentes: si hay prótesis entregadas sin laboratorio y con parte
-- del técnico, la migración NO se aplica (RAISE con los ids y no queda nada
-- a medias). Se descartó dejar el CHECK `NOT VALID`: Postgres revisa la fila
-- entera en cada UPDATE, y una entregada todavía se actualiza al desvincular
-- a su tratante (`memberId` a null, para poder borrar al miembro): ese
-- borrado fallaría sin explicación. Cómo resolverlas antes de aplicar (una
-- entregada no cambia desde la ficha, así que es a mano, en una transacción,
-- y sólo esas filas): averiguar con la clínica qué laboratorio hizo cada una
-- y correr, por cada id,
--
--   BEGIN;
--   ALTER TABLE "protesis" DISABLE TRIGGER "protesis_congelada";
--   UPDATE "protesis" p
--   SET "laboratorioId" = l."id", "laboratorioNombre" = l."nombre", "updatedAt" = CURRENT_TIMESTAMP
--   FROM "laboratorios" l
--   WHERE p."id" = '<id de la prótesis>' AND p."estado" = 'entregada' AND p."laboratorioId" IS NULL
--     AND l."id" = '<id del laboratorio>' AND l."businessId" = p."businessId";
--   -- Tiene que decir UPDATE 1; si no, ROLLBACK.
--   ALTER TABLE "protesis" ENABLE TRIGGER "protesis_congelada";
--   COMMIT;
--
-- (README.md, "Migraciones en producción", lo repite.) Con el laboratorio
-- puesto, su parte aparece en "Por pagar al laboratorio".
--
-- Compatible con el código de antes: el código viejo puede entregar sin
-- laboratorio; con esta migración aplicada esa entrega falla (500) en vez
-- de perder la parte del técnico. Se despliega enseguida.
--
-- Va entera en una transacción explícita. Se aplica con psql
-- (`-v ON_ERROR_STOP=1`). Requiere `20261108120000_etapa_7_protesis`,
-- `20261108130000_etapa_7b_abonos_de_protesis` y
-- `20261109120000_etapa_7c_protesis_por_tipo` aplicadas antes.
BEGIN;

-- ─── Antes de tocar nada: entregadas sin laboratorio con parte del técnico ──

DO $$
DECLARE
  ids TEXT;
BEGIN
  SELECT string_agg("id", ', ' ORDER BY "id") INTO ids
  FROM "public"."protesis"
  WHERE "estado" = 'entregada' AND "laboratorioId" IS NULL AND "pbTecnico" <> 0;
  IF ids IS NOT NULL THEN
    RAISE EXCEPTION 'etapa_7d: hay prótesis entregadas sin laboratorio y con parte del técnico: %', ids
      USING HINT = 'Asígnales el laboratorio a mano como explica la cabecera de esta migración (o README.md, "Migraciones en producción") y vuelve a aplicarla. No se aplicó nada.';
  END IF;
END;
$$;

-- ─── protesis ───────────────────────────────────────────────────────────────
-- Repite la regla de `requiereLaboratorioParaEntregar` (lib/protesis.ts): si
-- cambia una, cambia la otra.

ALTER TABLE "protesis" ADD CONSTRAINT "protesis_entrega_con_laboratorio_check"
CHECK ("estado" <> 'entregada' OR "laboratorioId" IS NOT NULL OR "pbTecnico" = 0);

-- ─── atencion_servicios ─────────────────────────────────────────────────────

-- El cuerpo de `20261108130000_etapa_7b_abonos_de_protesis`, con las reglas
-- de las etapas 7 y 7b sin cambios (sus comentarios están allí) y las tres
-- nuevas de esta migración (a, b, c de la cabecera).
CREATE OR REPLACE FUNCTION "public"."atencion_servicios_reparto_de_protesis"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  negocio TEXT;
  paciente TEXT;
  protesis_del_abono RECORD;
  -- La línea es nueva, o cambia de atención o de prótesis.
  cambia_linea BOOLEAN;
  -- Cambia el pago al laboratorio.
  cambia_pago BOOLEAN;
  -- Cambia a nombre de quién va (pasar `memberId` a null no cuenta: es desvincular).
  cambia_tratante BOOLEAN;
  -- Entra a una liquidación.
  entra_a_liquidacion BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."odontologoCents" IS NOT NULL AND (
         NEW."protesisId" IS DISTINCT FROM OLD."protesisId"
      OR NEW."priceCents" IS DISTINCT FROM OLD."priceCents"
      OR NEW."odontologoCents" IS DISTINCT FROM OLD."odontologoCents"
      OR NEW."clinicaCents" IS DISTINCT FROM OLD."clinicaCents"
      OR NEW."tecnicoCents" IS DISTINCT FROM OLD."tecnicoCents"
    ) AND EXISTS (SELECT 1 FROM "public"."atenciones" WHERE "id" = OLD."visitId") THEN
      RAISE EXCEPTION 'atencion_servicios %: el reparto del abono ya está congelado', OLD."id"
        USING ERRCODE = 'check_violation';
    END IF;

    IF OLD."pagoAlLaboratorioId" IS NOT NULL AND NEW."pagoAlLaboratorioId" IS NOT NULL
       AND NEW."pagoAlLaboratorioId" <> OLD."pagoAlLaboratorioId"
       AND EXISTS (SELECT 1 FROM "public"."atenciones" WHERE "id" = OLD."visitId") THEN
      RAISE EXCEPTION 'atencion_servicios %: la línea ya está en otro pago al laboratorio', OLD."id"
        USING ERRCODE = 'check_violation';
    END IF;

    cambia_linea := NEW."visitId" <> OLD."visitId" OR NEW."protesisId" IS DISTINCT FROM OLD."protesisId";
    cambia_pago := NEW."pagoAlLaboratorioId" IS DISTINCT FROM OLD."pagoAlLaboratorioId";
    cambia_tratante := NEW."byOwner" IS DISTINCT FROM OLD."byOwner"
      OR (NEW."memberId" IS NOT NULL AND NEW."memberId" IS DISTINCT FROM OLD."memberId");
    entra_a_liquidacion := NEW."liquidacionId" IS NOT NULL AND NEW."liquidacionId" IS DISTINCT FROM OLD."liquidacionId";

    IF NOT (cambia_linea OR cambia_pago OR cambia_tratante OR entra_a_liquidacion) THEN
      RETURN NEW;
    END IF;
  ELSE
    cambia_linea := TRUE;
    cambia_pago := NEW."pagoAlLaboratorioId" IS NOT NULL;
    cambia_tratante := TRUE;
    entra_a_liquidacion := NEW."liquidacionId" IS NOT NULL;
  END IF;

  IF NEW."protesisId" IS NULL AND NEW."pagoAlLaboratorioId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "businessId", "customerId" INTO negocio, paciente FROM "public"."atenciones" WHERE "id" = NEW."visitId";

  IF negocio IS NULL AND TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Etapas 7 y 7b: sólo cuando cambia la atención, la prótesis o el pago,
  -- como antes.
  IF cambia_linea OR cambia_pago THEN
    IF NEW."protesisId" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "public"."protesis" WHERE "id" = NEW."protesisId" AND "businessId" = negocio
    ) THEN
      RAISE EXCEPTION 'atencion_servicios %: la prótesis es de otro negocio', NEW."id"
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW."pagoAlLaboratorioId" IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM "public"."pagos_al_laboratorio" WHERE "id" = NEW."pagoAlLaboratorioId" AND "businessId" = negocio
    ) THEN
      RAISE EXCEPTION 'atencion_servicios %: el pago al laboratorio es de otro negocio', NEW."id"
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW."pagoAlLaboratorioId" IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM "public"."pagos_al_laboratorio" p
      JOIN "public"."protesis" pr ON pr."id" = NEW."protesisId"
      WHERE p."id" = NEW."pagoAlLaboratorioId"
        AND pr."laboratorioId" = p."laboratorioId"
        AND pr."entregadaEn" IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'atencion_servicios %: el pago es a otro laboratorio o la prótesis no está entregada', NEW."id"
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Nuevo en la etapa 7d: el abono, del paciente y a nombre de la tratante
  -- de su prótesis, y sólo se liquida entregada y a la tratante.
  IF NEW."protesisId" IS NOT NULL THEN
    SELECT "customerId", "memberId", "byOwner", "entregadaEn" INTO protesis_del_abono
    FROM "public"."protesis" WHERE "id" = NEW."protesisId";

    -- a. Del mismo paciente que la atención.
    IF cambia_linea AND protesis_del_abono."customerId" IS DISTINCT FROM paciente THEN
      RAISE EXCEPTION 'atencion_servicios %: la prótesis es de otro paciente', NEW."id"
        USING ERRCODE = 'check_violation';
    END IF;

    -- b. A nombre de la tratante (la dueña: `byOwner` y sin miembro).
    IF (cambia_linea OR cambia_tratante) AND (
         NEW."byOwner" IS DISTINCT FROM protesis_del_abono."byOwner"
      OR NEW."memberId" IS DISTINCT FROM (CASE WHEN protesis_del_abono."byOwner" THEN NULL ELSE protesis_del_abono."memberId" END)
    ) THEN
      RAISE EXCEPTION 'atencion_servicios %: el abono va a nombre de la tratante de la prótesis', NEW."id"
        USING ERRCODE = 'check_violation';
    END IF;

    -- c. A una liquidación, sólo entregada y de la tratante.
    IF entra_a_liquidacion AND (
         protesis_del_abono."entregadaEn" IS NULL
      OR NEW."memberId" IS NULL
      OR NEW."memberId" IS DISTINCT FROM protesis_del_abono."memberId"
      OR NEW."byOwner" IS DISTINCT FROM protesis_del_abono."byOwner"
    ) THEN
      RAISE EXCEPTION 'atencion_servicios %: el abono sólo se liquida a la tratante y con la prótesis entregada', NEW."id"
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
