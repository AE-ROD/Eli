-- Prótesis, tanda del cobro: la liquidación de la odontóloga suma su parte de
-- los abonos de prótesis entregadas, y la base cuida que lo que se le paga al
-- laboratorio sea de ese laboratorio. Escrita a mano en el estilo de
-- `etapa_7_protesis`, que no se toca (puede estar aplicada).
--
-- Aditiva y sin pérdida:
--   liquidaciones."comisionProtesisCents": la parte de la odontóloga de los
--     abonos que incluye la liquidación. NOT NULL DEFAULT 0: con un default
--     constante Postgres no reescribe la tabla, y las liquidaciones que ya
--     existen quedan en 0 (no tenían prótesis), así que sus CHECKs siguen
--     valiendo. Se suma al bruto: `liquidaciones_bruto_check` se reemplaza por
--     uno que la incluye.
--   atencion_servicios_abono_liquidado_check: un abono sólo entra a una
--     liquidación con su reparto congelado y si la tratante no es la dueña
--     (la dueña no se liquida a sí misma).
--   atencion_servicios_reparto_de_protesis (CREATE OR REPLACE): además de lo
--     de la etapa 7, una línea sólo se marca pagada al laboratorio si la
--     prótesis está entregada (la parte del técnico se libera al entregar) y
--     el pago es al laboratorio de esa prótesis.
--
-- Lo demás (qué se libera y cuándo, qué se le debe a cada laboratorio) lo
-- decide la aplicación: `lib/liquidacion.ts` y `lib/pagos-al-laboratorio.ts`.
-- El pago al laboratorio no sale de la caja del día: no cuenta en el cierre
-- de caja, como los adelantos (docs/PRODUCTO.md §7).
--
-- Va entera en una transacción explícita. Se aplica con psql
-- (`-v ON_ERROR_STOP=1`). Requiere `20261108120000_etapa_7_protesis`
-- aplicada antes.
BEGIN;

-- ─── liquidaciones ──────────────────────────────────────────────────────────

ALTER TABLE "liquidaciones" ADD COLUMN "comisionProtesisCents" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "liquidaciones" ADD CONSTRAINT "liquidaciones_comision_protesis_check"
CHECK ("comisionProtesisCents" >= 0 AND "comisionProtesisCents" <= 2000000000);

-- El bruto es comisiones (servicios, productos y prótesis) más propinas.
ALTER TABLE "liquidaciones" DROP CONSTRAINT "liquidaciones_bruto_check";
ALTER TABLE "liquidaciones" ADD CONSTRAINT "liquidaciones_bruto_check"
CHECK ("brutoCents"::BIGINT = "comisionServiciosCents"::BIGINT + "comisionProductosCents" + "comisionProtesisCents" + "propinasCents");

-- ─── atencion_servicios ─────────────────────────────────────────────────────

ALTER TABLE "atencion_servicios" ADD CONSTRAINT "atencion_servicios_abono_liquidado_check"
CHECK ("protesisId" IS NULL OR "liquidacionId" IS NULL OR ("odontologoCents" IS NOT NULL AND NOT "byOwner"));

-- Mismo cuerpo que en `20261108120000_etapa_7_protesis`, con la regla nueva
-- del pago al laboratorio al final. Los comentarios de cada regla están en
-- esa migración.
CREATE OR REPLACE FUNCTION "public"."atencion_servicios_reparto_de_protesis"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  negocio TEXT;
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

    IF NEW."visitId" = OLD."visitId"
       AND NEW."protesisId" IS NOT DISTINCT FROM OLD."protesisId"
       AND NEW."pagoAlLaboratorioId" IS NOT DISTINCT FROM OLD."pagoAlLaboratorioId" THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW."protesisId" IS NULL AND NEW."pagoAlLaboratorioId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "businessId" INTO negocio FROM "public"."atenciones" WHERE "id" = NEW."visitId";

  IF negocio IS NULL AND TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;

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

  -- Nuevo en la etapa 7b: sólo se le paga al laboratorio de la prótesis, y
  -- sólo lo liberado (la prótesis entregada).
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

  RETURN NEW;
END;
$$;

COMMIT;
