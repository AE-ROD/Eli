-- Prótesis, arreglos de la revisión pre-despliegue (2026-11-10): dos reglas de
-- la base que quedaron flojas. Escrita a mano en el estilo de
-- `etapa_7_protesis`; no toca 7, 7b, 7c ni 7d (pueden estar aplicadas): sólo
-- reemplaza (`CREATE OR REPLACE`) dos funciones de trigger. No crea tablas,
-- columnas ni CHECKs y no reescribe filas.
--
-- Lo que cambia:
--   1. eventos_de_protesis_inmutables (CREATE OR REPLACE): un paso del
--      seguimiento se borra sólo en la cascada de su prótesis, de su paciente
--      o de su negocio, igual que `protesis_no_se_borra`. Antes miraba sólo si
--      la prótesis existía: al borrar un negocio entero, Postgres corre las
--      cascadas de `negocios` en el orden del nombre de sus triggers internos
--      (`RI_ConstraintTrigger_a_<oid>`). Si la de `eventos_de_protesis` corría
--      antes que la de `protesis` (o la de `clientes`), el evento veía su
--      prótesis todavía viva y el borrado del negocio fallaba entero. Hoy el
--      orden sale bien por casualidad de los oid; tras restaurar un respaldo
--      (oid nuevos) podía dejar de salir.
--   2. atencion_servicios_reparto_de_protesis (CREATE OR REPLACE): todo lo de
--      las etapas 7, 7b y 7d, igual, más una regla: al agregar un abono (o si
--      la línea cambia de atención o de prótesis), la prótesis no está
--      anulada. Hoy lo cumple la aplicación (`agregarAbono`,
--      lib/abonos-de-protesis.ts: 409 "La prótesis está anulada: no recibe
--      abonos."); ésta es la segunda barrera, porque no hay RLS detrás
--      (CLAUDE.md, regla 5). Los abonos que una prótesis ya tenía al anularse
--      no se tocan: la regla mira lo que se escribe desde ahora.
--
-- Compatible en los dos sentidos: el código de hoy y el anterior ya cumplen
-- las dos reglas, así que se aplica antes o después de desplegar.
--
-- Va entera en una transacción explícita. Se aplica con psql
-- (`-v ON_ERROR_STOP=1`). Requiere `20261108120000_etapa_7_protesis`,
-- `20261108130000_etapa_7b_abonos_de_protesis`,
-- `20261109120000_etapa_7c_protesis_por_tipo` y
-- `20261109130000_etapa_7d_protesis_entrega_con_laboratorio` aplicadas
-- antes: el bloque de abajo lo revisa y, si falta alguna, no aplica nada (si
-- se aplicara antes que la 7d, la 7d después pisaría la regla nueva con su
-- versión de la función).
BEGIN;

-- Reemplazar una función no bloquea las tablas de sus triggers; igual, como
-- toda migración desde ésta: si algo tuviera que esperar un candado más de 5
-- segundos, falla entera (sin dejar nada a medias) en vez de dejar las
-- escrituras del local en fila detrás de ella. Se reintenta en otro momento.
SET LOCAL lock_timeout = '5s';

-- ─── Antes de tocar nada: las migraciones de las prótesis, aplicadas ────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'liquidaciones' AND column_name = 'comisionProtesisCents'
  ) THEN
    RAISE EXCEPTION 'etapa_8: falta 20261108130000_etapa_7b_abonos_de_protesis (liquidaciones."comisionProtesisCents")'
      USING HINT = 'Aplica antes las migraciones de las prótesis en orden (README.md, "Las migraciones de la clínica dental, en orden"). No se aplicó nada.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'protesis_tono_check') THEN
    RAISE EXCEPTION 'etapa_8: falta 20261109120000_etapa_7c_protesis_por_tipo (protesis_tono_check)'
      USING HINT = 'Aplica antes las migraciones de las prótesis en orden (README.md, "Las migraciones de la clínica dental, en orden"). No se aplicó nada.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'protesis_entrega_con_laboratorio_check') THEN
    RAISE EXCEPTION 'etapa_8: falta 20261109130000_etapa_7d_protesis_entrega_con_laboratorio (protesis_entrega_con_laboratorio_check)'
      USING HINT = 'Aplica antes las migraciones de las prótesis en orden (README.md, "Las migraciones de la clínica dental, en orden"). No se aplicó nada.';
  END IF;
END;
$$;

-- ─── eventos_de_protesis ────────────────────────────────────────────────────

-- Un evento no se edita nunca; se borra sólo si su prótesis, el paciente de
-- esa prótesis o su negocio ya no existen (la cascada de cualquiera de los
-- tres, en el orden que Postgres elija).
CREATE OR REPLACE FUNCTION "public"."eventos_de_protesis_inmutables"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'eventos_de_protesis %: un paso del seguimiento no se edita', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "public"."protesis" p
    JOIN "public"."clientes" c ON c."id" = p."customerId"
    WHERE p."id" = OLD."protesisId"
  ) AND EXISTS (SELECT 1 FROM "public"."negocios" WHERE "id" = OLD."businessId") THEN
    RAISE EXCEPTION 'eventos_de_protesis %: un paso del seguimiento no se borra', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN OLD;
END;
$$;

-- ─── atencion_servicios ─────────────────────────────────────────────────────

-- El cuerpo de `20261109130000_etapa_7d_protesis_entrega_con_laboratorio`,
-- con las reglas de las etapas 7, 7b y 7d sin cambios (sus comentarios están
-- allí) y la nueva de esta migración (punto 2 de la cabecera), marcada.
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
    SELECT "customerId", "memberId", "byOwner", "entregadaEn", "estado" INTO protesis_del_abono
    FROM "public"."protesis" WHERE "id" = NEW."protesisId";

    -- Nuevo en la etapa 8: una prótesis anulada no recibe abonos.
    IF cambia_linea AND protesis_del_abono."estado" = 'anulada' THEN
      RAISE EXCEPTION 'atencion_servicios %: la prótesis está anulada y no recibe abonos', NEW."id"
        USING ERRCODE = 'check_violation';
    END IF;

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
