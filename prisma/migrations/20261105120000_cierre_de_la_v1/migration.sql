-- Cierre de la v1: deudas de esquema que el código ya cubre, pasadas a la base
-- como segunda barrera (no hay RLS). Una sola migración, escrita a mano.
--
-- Lo que hace:
--   clientes.tags (#160): default '{}' y los NULL que quedan pasan a '{}'. Es
--     la ÚNICA escritura sobre filas existentes de toda la migración.
--   CHECKs de dominio (#90, #50): los valores que la app ya restringe, en
--     citas, clientes, negocios, miembros_negocio, invitaciones, atencion_pagos,
--     horarios_laborales y servicios. Todos van `NOT VALID`: no se revisan
--     las filas que ya están (la migración no puede fallar por un dato viejo),
--     sí toda fila que se inserte o se actualice desde ahora.
--   citas(startTime) (#50): índice para el cron de recordatorios, que busca
--     por hora en todos los negocios y no puede usar los que empiezan por
--     businessId.
--   Triggers (#143): las tres funciones de la etapa 2 quedan como la de la
--     etapa 5: tablas calificadas con "public" y `search_path` fijo. Mismo
--     cuerpo y mismo comportamiento; los triggers no se tocan (siguen
--     apuntando a la misma función, que se reemplaza en el lugar).
--
-- OJO con `NOT VALID`: Postgres no revisa las filas viejas al crear la
-- restricción, pero sí revisa la fila entera cada vez que se actualiza. Una
-- fila vieja con un valor fuera de la lista no se rompe al aplicar esto, pero
-- después no se puede editar (ni siquiera otro campo) hasta corregir ese
-- valor. Por eso, ANTES de aplicarla, correr las consultas de sólo lectura
-- del README ("Migraciones en producción", esta carpeta): tienen que volver
-- vacías. Con eso confirmado, cada restricción se puede validar después con
-- `ALTER TABLE … VALIDATE CONSTRAINT …` (opcional; no bloquea escrituras).
--
-- El orden importa: el UPDATE de clientes.tags va ANTES de las CHECKs de
-- clientes, para que no lo frene una fila vieja con un origen de WhatsApp
-- fuera de la lista.
--
-- Va entera en una transacción explícita: si algo falla a mitad, no queda
-- aplicada a medias. Se aplica con psql (`-v ON_ERROR_STOP=1`). El índice se
-- crea sin CONCURRENTLY (no se puede dentro de una transacción): bloquea las
-- escrituras en citas mientras se arma, que con el tamaño de hoy es un
-- instante.
BEGIN;

-- ─── clientes.tags: default y sin NULL (#160) ───────────────────────────────
-- Los clientes creados por la reserva pública y "Anotar sin reserva" antes de
-- v1-qa-g quedaron con NULL. El código ya los trata como lista vacía
-- (`clienteNoEliminado` en lib/clientes-eliminados.ts); esto deja la base
-- igual que lo que el código supone. No es NOT NULL: eso sí podría fallar si
-- entre el UPDATE y el ALTER entrara un NULL nuevo desde código viejo.
ALTER TABLE "clientes" ALTER COLUMN "tags" SET DEFAULT ARRAY[]::TEXT[];
UPDATE "clientes" SET "tags" = ARRAY[]::TEXT[] WHERE "tags" IS NULL;

-- CreateIndex (#50): el cron de recordatorios busca por hora en todos los negocios.
CREATE INDEX "citas_startTime_idx" ON "citas"("startTime");


-- ─── Restricciones CHECK, escritas a mano (NOT VALID) ───────────────────────
-- Prisma no las representa en el esquema (ver la migración del tablero). Si
-- alguien corre `migrate dev`, revisar que no las borre por "drift".

-- citas: los estados de `ESTADOS_DE_CITA` (lib/campos-del-panel.ts) y quién
-- canceló ("cliente" desde el enlace de la cita, "negocio" desde el panel).
ALTER TABLE "citas" ADD CONSTRAINT "citas_status_check" CHECK ("status" IN ('pendiente', 'confirmada', 'en-progreso', 'completada', 'cancelada', 'no-asistio')) NOT VALID;
ALTER TABLE "citas" ADD CONSTRAINT "citas_canceladaPor_check" CHECK ("canceladaPor" IS NULL OR "canceladaPor" IN ('cliente', 'negocio')) NOT VALID;

-- clientes: de dónde vino el consentimiento de WhatsApp (reserva pública,
-- panel o importación de CSV), como `correoPromoConsentSource`.
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_whatsappConsentSource_check" CHECK ("whatsappConsentSource" IS NULL OR "whatsappConsentSource" IN ('reserva-publica', 'panel', 'importacion')) NOT VALID;

-- negocios: el plazo para cancelar o reagendar, de PLAZO_MINIMO_HORAS a
-- PLAZO_MAXIMO_HORAS (lib/gestion-de-cita.ts).
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_cancelacionHorasAntes_check" CHECK ("cancelacionHorasAntes" >= 0 AND "cancelacionHorasAntes" <= 72) NOT VALID;

-- negocios: el rubro. Los tres de `RUBROS` (lib/rubros.ts) más los de cuando
-- Eli apuntaba a otros rubros (`salud`, `fitness`, `otro`), que siguen
-- guardados en negocios reales y se muestran como "Otro rubro": sin ellos,
-- esos negocios no podrían guardar ningún cambio de su configuración.
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_type_check" CHECK ("type" IN ('salon', 'barberia', 'spa-de-unas', 'salud', 'fitness', 'otro')) NOT VALID;

-- miembros_negocio e invitaciones: el dueño no es miembro, así que sólo hay
-- encargado ("admin") y profesional ("worker").
ALTER TABLE "miembros_negocio" ADD CONSTRAINT "miembros_negocio_role_check" CHECK ("role" IN ('admin', 'worker')) NOT VALID;
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_role_check" CHECK ("role" IN ('admin', 'worker')) NOT VALID;

-- atencion_pagos: los ids de `MEDIOS_DE_PAGO` (lib/medios-de-pago.ts).
ALTER TABLE "atencion_pagos" ADD CONSTRAINT "atencion_pagos_method_check" CHECK ("method" IN ('efectivo', 'tarjeta-debito', 'tarjeta-credito', 'transferencia', 'billetera-digital')) NOT VALID;

-- horarios_laborales: 0 = domingo … 6 = sábado, como franjas_de_hora_valle.
ALTER TABLE "horarios_laborales" ADD CONSTRAINT "horarios_laborales_dayOfWeek_check" CHECK ("dayOfWeek" >= 0 AND "dayOfWeek" <= 6) NOT VALID;

-- servicios: una duración de cero o negativa no ocupa la agenda y rompe el
-- cálculo de horas libres. La app pide de 15 a 480; acá sólo lo que no tiene
-- sentido nunca, para no frenar un servicio viejo de 10 minutos.
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_duration_check" CHECK ("duration" > 0) NOT VALID;


-- ─── Triggers de la etapa 2, endurecidos (#143) ─────────────────────────────
-- Mismo cuerpo que en `20261028120000_etapa_2_la_plata_del_equipo`, con las
-- tablas calificadas con "public" y el `search_path` fijo, como
-- `cita_servicios_mismo_negocio` (etapa 5): así la función no depende del
-- `search_path` de quien escribe la fila, y nadie puede hacerla mirar otra
-- tabla puesta antes en el camino. Ninguna es SECURITY DEFINER. Los
-- comentarios de cada regla están en la migración de la etapa 2.
CREATE OR REPLACE FUNCTION "public"."atencion_servicios_comision_inmutable"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD."commissionAt" IS NOT NULL AND (
       NEW."commissionPercent" IS DISTINCT FROM OLD."commissionPercent"
    OR NEW."commissionCents" IS DISTINCT FROM OLD."commissionCents"
    OR NEW."commissionAt" IS DISTINCT FROM OLD."commissionAt"
  ) THEN
    RAISE EXCEPTION 'atencion_servicios %: la comisión ya está congelada', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD."liquidacionId" IS NOT NULL AND (
       NEW."priceCents" IS DISTINCT FROM OLD."priceCents"
    OR NEW."memberId" IS DISTINCT FROM OLD."memberId"
    OR NEW."commissionPercent" IS DISTINCT FROM OLD."commissionPercent"
    OR NEW."commissionCents" IS DISTINCT FROM OLD."commissionCents"
    OR NEW."commissionAt" IS DISTINCT FROM OLD."commissionAt"
  ) AND EXISTS (SELECT 1 FROM "public"."atenciones" WHERE "id" = OLD."visitId") THEN
    RAISE EXCEPTION 'atencion_servicios %: la línea está en una liquidación; corrígela con un ajuste', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD."liquidacionId" IS NOT NULL AND NEW."liquidacionId" IS NOT NULL
     AND NEW."liquidacionId" <> OLD."liquidacionId"
     AND EXISTS (SELECT 1 FROM "public"."atenciones" WHERE "id" = OLD."visitId") THEN
    RAISE EXCEPTION 'atencion_servicios %: la línea ya está en otra liquidación', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."atencion_servicios_liquidada_no_se_borra"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD."liquidacionId" IS NOT NULL
     AND EXISTS (SELECT 1 FROM "public"."atenciones" WHERE "id" = OLD."visitId") THEN
    RAISE EXCEPTION 'atencion_servicios %: la línea está en una liquidación; no se borra', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."atencion_servicios_mismo_negocio"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  negocio TEXT;
BEGIN
  IF NEW."memberId" IS NULL AND NEW."productId" IS NULL AND NEW."liquidacionId" IS NULL THEN
    RETURN NEW;
  END IF;

  -- En INSERT no se lee OLD: el IF de afuera separa los dos casos.
  IF TG_OP = 'UPDATE' THEN
    IF NEW."visitId" = OLD."visitId"
       AND NEW."memberId" IS NOT DISTINCT FROM OLD."memberId"
       AND NEW."productId" IS NOT DISTINCT FROM OLD."productId"
       AND NEW."liquidacionId" IS NOT DISTINCT FROM OLD."liquidacionId" THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT "businessId" INTO negocio FROM "public"."atenciones" WHERE "id" = NEW."visitId";

  -- En un UPDATE sin atención estamos dentro de una cascada (borrar el
  -- negocio): la línea se va a borrar igual, no hay negocio con qué
  -- comparar. En un INSERT no pasa: la FK a `atenciones` ya lo rechaza.
  IF negocio IS NULL AND TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW."memberId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "public"."miembros_negocio" WHERE "id" = NEW."memberId" AND "businessId" = negocio
  ) THEN
    RAISE EXCEPTION 'atencion_servicios %: el profesional es de otro negocio', NEW."id"
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW."productId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "public"."productos" WHERE "id" = NEW."productId" AND "businessId" = negocio
  ) THEN
    RAISE EXCEPTION 'atencion_servicios %: el producto es de otro negocio', NEW."id"
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW."liquidacionId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "public"."liquidaciones" WHERE "id" = NEW."liquidacionId" AND "businessId" = negocio
  ) THEN
    RAISE EXCEPTION 'atencion_servicios %: la liquidación es de otro negocio', NEW."id"
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
