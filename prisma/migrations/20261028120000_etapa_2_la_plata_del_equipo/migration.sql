-- Etapa 2 "La plata del equipo": una sola migración para toda la etapa.
-- Aditiva y sin pérdida: agrega columnas nullable o con default, crea tablas
-- nuevas con sus índices y claves foráneas, CHECKs y triggers. No toca ni
-- reescribe filas existentes, así que el código viejo sigue funcionando con
-- ella aplicada.
--
-- Lo que agrega:
--   negocios: tipo de período de liquidación (default 'mensual') y día de
--     inicio de la semana (default 1 = lunes).
--   atenciones: único (id, businessId), para las FK compuestas.
--   atencion_servicios: tipo de línea (servicio/producto), producto,
--     comisión congelada por línea (%, monto, cuándo) y la liquidación que la
--     pagó. Las columnas de comisión de `citas` quedan sin uso.
--   cambios_comision: el producto del cambio (scope 'product').
--   productos, atencion_propinas, liquidaciones, movimientos_de_liquidacion,
--   cierres_de_caja: tablas nuevas.
--
-- Dinero en centavos INTEGER con tope 2.000.000.000, como el tablero. Las FK a
-- miembros son compuestas (id, businessId) y NO ACTION: ni Restrict (rompería
-- el borrado en cascada del negocio entero) ni SetNull (en una compuesta
-- anularía también businessId).
--
-- Va entera en una transacción explícita: si algo falla a mitad, no queda
-- aplicada a medias. Se aplica con psql (`-v ON_ERROR_STOP=1`). Orden de
-- despliegue: README.md, sección "Migraciones en producción".
BEGIN;
-- AlterTable
ALTER TABLE "negocios" ADD COLUMN     "liquidacionInicioSemana" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "liquidacionPeriodo" TEXT NOT NULL DEFAULT 'mensual',
ADD COLUMN     "liquidacionDesde" DATE;

-- AlterTable
ALTER TABLE "atencion_servicios" ADD COLUMN     "commissionAt" TIMESTAMP(3),
ADD COLUMN     "commissionCents" INTEGER,
ADD COLUMN     "commissionPercent" DOUBLE PRECISION,
ADD COLUMN     "liquidacionId" TEXT,
ADD COLUMN     "productId" TEXT,
ADD COLUMN     "tipo" TEXT NOT NULL DEFAULT 'servicio';

-- AlterTable
ALTER TABLE "cambios_comision" ADD COLUMN     "productId" TEXT,
ADD COLUMN     "productName" TEXT;

-- CreateTable
CREATE TABLE "productos" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER,
    "commissionPercent" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "productos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "atencion_propinas" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "memberId" TEXT,
    "byOwner" BOOLEAN NOT NULL DEFAULT false,
    "professionalName" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "liquidacionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "atencion_propinas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidaciones" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "memberName" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "desde" DATE NOT NULL,
    "hasta" DATE NOT NULL,
    "zona" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'cerrada',
    "comisionServiciosCents" INTEGER NOT NULL,
    "comisionProductosCents" INTEGER NOT NULL,
    "propinasCents" INTEGER NOT NULL,
    "adelantosCents" INTEGER NOT NULL,
    "ajustesCents" INTEGER NOT NULL,
    "brutoCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "cerradaAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cerradaPorId" TEXT NOT NULL,
    "cerradaPorNombre" TEXT NOT NULL,
    "pagadaAt" TIMESTAMP(3),
    "pagadaPorId" TEXT,
    "pagadaPorNombre" TEXT,
    "medioDePago" TEXT,
    "anuladaAt" TIMESTAMP(3),
    "anuladaPorId" TEXT,
    "anuladaPorNombre" TEXT,
    "motivoAnulacion" TEXT,
    "nota" TEXT,

    CONSTRAINT "liquidaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_de_liquidacion" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "memberName" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "montoCents" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "motivo" TEXT,
    "visitId" TEXT,
    "liquidacionId" TEXT,
    "anuladoAt" TIMESTAMP(3),
    "anuladoPorId" TEXT,
    "anuladoPorNombre" TEXT,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_de_liquidacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cierres_de_caja" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "desde" TIMESTAMP(3) NOT NULL,
    "hasta" TIMESTAMP(3) NOT NULL,
    "fecha" DATE NOT NULL,
    "zona" TEXT NOT NULL,
    "fondoInicialCents" INTEGER NOT NULL,
    "efectivoCobradoCents" INTEGER NOT NULL,
    "propinasEfectivoCents" INTEGER NOT NULL,
    "efectivoEsperadoCents" INTEGER NOT NULL,
    "efectivoContadoCents" INTEGER NOT NULL,
    "diferenciaCents" INTEGER NOT NULL,
    "desglose" JSONB NOT NULL DEFAULT '{}',
    "nota" TEXT,
    "cerradoPorId" TEXT NOT NULL,
    "cerradoPorNombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cierres_de_caja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "productos_businessId_idx" ON "productos"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "productos_id_businessId_key" ON "productos"("id", "businessId");

-- CreateIndex
CREATE INDEX "atencion_propinas_visitId_idx" ON "atencion_propinas"("visitId");

-- CreateIndex
CREATE INDEX "atencion_propinas_businessId_memberId_liquidacionId_idx" ON "atencion_propinas"("businessId", "memberId", "liquidacionId");

-- CreateIndex
CREATE INDEX "liquidaciones_businessId_memberId_desde_idx" ON "liquidaciones"("businessId", "memberId", "desde");

-- CreateIndex
CREATE UNIQUE INDEX "liquidaciones_id_businessId_key" ON "liquidaciones"("id", "businessId");

-- CreateIndex
CREATE INDEX "movimientos_de_liquidacion_businessId_memberId_liquidacionI_idx" ON "movimientos_de_liquidacion"("businessId", "memberId", "liquidacionId");

-- CreateIndex
CREATE INDEX "cierres_de_caja_businessId_desde_idx" ON "cierres_de_caja"("businessId", "desde");

-- CreateIndex
CREATE UNIQUE INDEX "cierres_de_caja_businessId_hasta_key" ON "cierres_de_caja"("businessId", "hasta");

-- CreateIndex
CREATE UNIQUE INDEX "atenciones_id_businessId_key" ON "atenciones"("id", "businessId");

-- CreateIndex
CREATE INDEX "atencion_servicios_productId_idx" ON "atencion_servicios"("productId");

-- CreateIndex
CREATE INDEX "atencion_servicios_memberId_liquidacionId_idx" ON "atencion_servicios"("memberId", "liquidacionId");

-- AddForeignKey
ALTER TABLE "atencion_servicios" ADD CONSTRAINT "atencion_servicios_productId_fkey" FOREIGN KEY ("productId") REFERENCES "productos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atencion_servicios" ADD CONSTRAINT "atencion_servicios_liquidacionId_fkey" FOREIGN KEY ("liquidacionId") REFERENCES "liquidaciones"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "productos" ADD CONSTRAINT "productos_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atencion_propinas" ADD CONSTRAINT "atencion_propinas_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atencion_propinas" ADD CONSTRAINT "atencion_propinas_visitId_businessId_fkey" FOREIGN KEY ("visitId", "businessId") REFERENCES "atenciones"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atencion_propinas" ADD CONSTRAINT "atencion_propinas_memberId_businessId_fkey" FOREIGN KEY ("memberId", "businessId") REFERENCES "miembros_negocio"("id", "businessId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atencion_propinas" ADD CONSTRAINT "atencion_propinas_liquidacionId_businessId_fkey" FOREIGN KEY ("liquidacionId", "businessId") REFERENCES "liquidaciones"("id", "businessId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones" ADD CONSTRAINT "liquidaciones_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones" ADD CONSTRAINT "liquidaciones_memberId_businessId_fkey" FOREIGN KEY ("memberId", "businessId") REFERENCES "miembros_negocio"("id", "businessId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_de_liquidacion" ADD CONSTRAINT "movimientos_de_liquidacion_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_de_liquidacion" ADD CONSTRAINT "movimientos_de_liquidacion_memberId_businessId_fkey" FOREIGN KEY ("memberId", "businessId") REFERENCES "miembros_negocio"("id", "businessId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_de_liquidacion" ADD CONSTRAINT "movimientos_de_liquidacion_visitId_businessId_fkey" FOREIGN KEY ("visitId", "businessId") REFERENCES "atenciones"("id", "businessId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_de_liquidacion" ADD CONSTRAINT "movimientos_de_liquidacion_liquidacionId_businessId_fkey" FOREIGN KEY ("liquidacionId", "businessId") REFERENCES "liquidaciones"("id", "businessId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierres_de_caja" ADD CONSTRAINT "cierres_de_caja_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cambios_comision" ADD CONSTRAINT "cambios_comision_productId_fkey" FOREIGN KEY ("productId") REFERENCES "productos"("id") ON DELETE SET NULL ON UPDATE CASCADE;



-- ─── Restricciones CHECK, escritas a mano ───────────────────────────────────
-- Prisma no las representa en el esquema (ver la migración del tablero). Son
-- la segunda barrera, porque no hay RLS. Si alguien corre `migrate dev`,
-- revisar que no las borre por "drift".

-- negocios
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_liquidacionPeriodo_check" CHECK ("liquidacionPeriodo" IN ('semanal', 'quincenal', 'mensual'));
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_liquidacionInicioSemana_check" CHECK ("liquidacionInicioSemana" >= 0 AND "liquidacionInicioSemana" <= 6);

-- productos: null es "sin configurar", no 0.
ALTER TABLE "productos" ADD CONSTRAINT "productos_priceCents_check" CHECK ("priceCents" IS NULL OR ("priceCents" >= 0 AND "priceCents" <= 2000000000));
ALTER TABLE "productos" ADD CONSTRAINT "productos_commissionPercent_check" CHECK ("commissionPercent" IS NULL OR ("commissionPercent" >= 0 AND "commissionPercent" <= 100));

-- atencion_servicios
ALTER TABLE "atencion_servicios" ADD CONSTRAINT "atencion_servicios_tipo_check" CHECK ("tipo" IN ('servicio', 'producto'));
-- Una línea de servicio no lleva producto, y una de producto no lleva servicio.
ALTER TABLE "atencion_servicios" ADD CONSTRAINT "atencion_servicios_tipo_coherente_check"
CHECK (("tipo" = 'producto' OR "productId" IS NULL) AND ("tipo" = 'servicio' OR "serviceId" IS NULL));
ALTER TABLE "atencion_servicios" ADD CONSTRAINT "atencion_servicios_commissionPercent_check" CHECK ("commissionPercent" IS NULL OR ("commissionPercent" >= 0 AND "commissionPercent" <= 100));
ALTER TABLE "atencion_servicios" ADD CONSTRAINT "atencion_servicios_commissionCents_check" CHECK ("commissionCents" IS NULL OR ("commissionCents" >= 0 AND "commissionCents" <= "priceCents"));
-- Comisión todo-o-nada, como `citas_comision_congelada_check`: los tres null
-- es "pendiente"; nunca un monto 0 con el % en null.
ALTER TABLE "atencion_servicios" ADD CONSTRAINT "atencion_servicios_comision_congelada_check"
CHECK (("commissionPercent" IS NULL AND "commissionCents" IS NULL AND "commissionAt" IS NULL)
    OR ("commissionPercent" IS NOT NULL AND "commissionCents" IS NOT NULL AND "commissionAt" IS NOT NULL));
-- La dueña no se paga comisión a sí misma.
ALTER TABLE "atencion_servicios" ADD CONSTRAINT "atencion_servicios_duena_sin_comision_check" CHECK (NOT ("byOwner" AND "commissionAt" IS NOT NULL));

-- atencion_propinas: o de la dueña o de un miembro, nunca los dos ni ninguno;
-- la de la dueña no entra a una liquidación.
ALTER TABLE "atencion_propinas" ADD CONSTRAINT "atencion_propinas_amountCents_check" CHECK ("amountCents" > 0 AND "amountCents" <= 2000000000);
ALTER TABLE "atencion_propinas" ADD CONSTRAINT "atencion_propinas_profesional_check"
CHECK (("byOwner" AND "memberId" IS NULL) OR (NOT "byOwner" AND "memberId" IS NOT NULL));
ALTER TABLE "atencion_propinas" ADD CONSTRAINT "atencion_propinas_duena_sin_liquidacion_check" CHECK (NOT ("byOwner" AND "liquidacionId" IS NOT NULL));

-- liquidaciones
ALTER TABLE "liquidaciones" ADD CONSTRAINT "liquidaciones_periodo_check" CHECK ("periodo" IN ('semanal', 'quincenal', 'mensual'));
ALTER TABLE "liquidaciones" ADD CONSTRAINT "liquidaciones_rango_check" CHECK ("hasta" >= "desde");
ALTER TABLE "liquidaciones" ADD CONSTRAINT "liquidaciones_estado_check" CHECK ("estado" IN ('cerrada', 'pagada', 'anulada'));
ALTER TABLE "liquidaciones" ADD CONSTRAINT "liquidaciones_montos_check"
CHECK ("comisionServiciosCents" >= 0 AND "comisionServiciosCents" <= 2000000000
   AND "comisionProductosCents" >= 0 AND "comisionProductosCents" <= 2000000000
   AND "propinasCents" >= 0 AND "propinasCents" <= 2000000000
   AND "adelantosCents" >= 0 AND "adelantosCents" <= 2000000000
   AND "ajustesCents" >= -2000000000 AND "ajustesCents" <= 2000000000
   AND "brutoCents" >= 0 AND "brutoCents" <= 2000000000
   AND "totalCents" >= 0 AND "totalCents" <= 2000000000);
-- El total sale del snapshot y no se puede escribir mal: bruto (comisiones +
-- propinas) menos adelantos y vales, más ajustes con signo.
ALTER TABLE "liquidaciones" ADD CONSTRAINT "liquidaciones_bruto_check"
CHECK ("brutoCents"::BIGINT = "comisionServiciosCents"::BIGINT + "comisionProductosCents" + "propinasCents");
ALTER TABLE "liquidaciones" ADD CONSTRAINT "liquidaciones_total_check"
CHECK ("totalCents"::BIGINT = "brutoCents"::BIGINT - "adelantosCents" + "ajustesCents");
-- El estado y su fecha van juntos: no hay "pagada" sin cuándo, ni al revés.
ALTER TABLE "liquidaciones" ADD CONSTRAINT "liquidaciones_pagada_check" CHECK (("estado" = 'pagada') = ("pagadaAt" IS NOT NULL));
ALTER TABLE "liquidaciones" ADD CONSTRAINT "liquidaciones_anulada_check" CHECK (("estado" = 'anulada') = ("anuladaAt" IS NOT NULL));

-- movimientos_de_liquidacion: adelanto y vale positivos; ajuste con signo,
-- distinto de 0. Uno anulado no puede estar en una liquidación.
ALTER TABLE "movimientos_de_liquidacion" ADD CONSTRAINT "movimientos_de_liquidacion_monto_check"
CHECK (("tipo" IN ('adelanto', 'vale') AND "montoCents" > 0 AND "montoCents" <= 2000000000)
    OR ("tipo" = 'ajuste' AND "montoCents" <> 0 AND "montoCents" >= -2000000000 AND "montoCents" <= 2000000000));
ALTER TABLE "movimientos_de_liquidacion" ADD CONSTRAINT "movimientos_de_liquidacion_anulado_check" CHECK (NOT ("anuladoAt" IS NOT NULL AND "liquidacionId" IS NOT NULL));

-- cierres_de_caja: el esperado y la diferencia no se pueden escribir mal.
ALTER TABLE "cierres_de_caja" ADD CONSTRAINT "cierres_de_caja_rango_check" CHECK ("hasta" > "desde");
ALTER TABLE "cierres_de_caja" ADD CONSTRAINT "cierres_de_caja_montos_check"
CHECK ("fondoInicialCents" >= 0 AND "fondoInicialCents" <= 2000000000
   AND "efectivoCobradoCents" >= 0 AND "efectivoCobradoCents" <= 2000000000
   AND "propinasEfectivoCents" >= 0 AND "propinasEfectivoCents" <= 2000000000
   AND "efectivoContadoCents" >= 0 AND "efectivoContadoCents" <= 2000000000);
ALTER TABLE "cierres_de_caja" ADD CONSTRAINT "cierres_de_caja_esperado_check"
CHECK ("efectivoEsperadoCents"::BIGINT = "fondoInicialCents"::BIGINT + "efectivoCobradoCents" + "propinasEfectivoCents");
ALTER TABLE "cierres_de_caja" ADD CONSTRAINT "cierres_de_caja_diferencia_check"
CHECK ("diferenciaCents"::BIGINT = "efectivoContadoCents"::BIGINT - "efectivoEsperadoCents");

-- cambios_comision: el scope suma 'product' (el % de un producto).
ALTER TABLE "cambios_comision" DROP CONSTRAINT "cambios_comision_scope_check";
ALTER TABLE "cambios_comision" ADD CONSTRAINT "cambios_comision_scope_check" CHECK ("scope" IN ('default', 'service', 'product'));


-- ─── Índice único parcial, escrito a mano ───────────────────────────────────
-- Una sola liquidación viva por (negocio, miembro, desde): dos cierres
-- simultáneos del mismo período chocan acá (el segundo es 409). Las anuladas
-- no cuentan, para poder volver a cerrar el período. Prisma no lo representa.
CREATE UNIQUE INDEX "liquidaciones_businessId_memberId_desde_viva_key" ON "liquidaciones"("businessId", "memberId", "desde") WHERE "estado" <> 'anulada';


-- ─── Trigger: lo congelado no se toca ───────────────────────────────────────
-- Una comisión congelada (commissionAt no null) no cambia nunca: cambiar un %
-- después no puede alterar lo ya cobrado. Y una línea que ya está en una
-- liquidación no cambia de precio, de profesional ni de comisión: lo pagado
-- se corrige con un ajuste. Sí se puede quitar `liquidacionId` (anular la
-- liquidación la libera) y congelar una pendiente en la misma UPDATE que la
-- incluye en una liquidación. Lo que no se puede es pasarla de una
-- liquidación a otra: primero se anula la que la tiene.
-- Las reglas de línea liquidada se saltan solo si su atención ya no existe:
-- al borrar el negocio entero, la cascada de `miembros_negocio` pone
-- `memberId` en NULL en líneas cuya atención ya se borró en la misma
-- cascada, y eso no debe hacer fallar el borrado. Es la misma excepción que
-- el trigger BEFORE DELETE de abajo; con la atención viva, nunca aplica.
CREATE FUNCTION atencion_servicios_comision_inmutable() RETURNS trigger
LANGUAGE plpgsql AS $$
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
  ) AND EXISTS (SELECT 1 FROM "atenciones" WHERE "id" = OLD."visitId") THEN
    RAISE EXCEPTION 'atencion_servicios %: la línea está en una liquidación; corrígela con un ajuste', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD."liquidacionId" IS NOT NULL AND NEW."liquidacionId" IS NOT NULL
     AND NEW."liquidacionId" <> OLD."liquidacionId"
     AND EXISTS (SELECT 1 FROM "atenciones" WHERE "id" = OLD."visitId") THEN
    RAISE EXCEPTION 'atencion_servicios %: la línea ya está en otra liquidación', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER atencion_servicios_comision_inmutable
BEFORE UPDATE ON "atencion_servicios"
FOR EACH ROW EXECUTE FUNCTION atencion_servicios_comision_inmutable();


-- ─── Trigger: una línea liquidada no se borra ───────────────────────────────
-- Lo que entró en una liquidación ya se le pagó (o se le va a pagar) a
-- alguien: borrar la línea dejaría la liquidación sin respaldo. Se anula la
-- liquidación primero. La excepción es el borrado en cascada (borrar el
-- negocio entero): cuando la cascada llega a la línea, su atención ya no
-- existe, y eso se deja pasar. El trigger de arriba usa la misma excepción
-- para el `memberId` que la cascada de miembros pone en NULL.
CREATE FUNCTION atencion_servicios_liquidada_no_se_borra() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."liquidacionId" IS NOT NULL
     AND EXISTS (SELECT 1 FROM "atenciones" WHERE "id" = OLD."visitId") THEN
    RAISE EXCEPTION 'atencion_servicios %: la línea está en una liquidación; no se borra', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER atencion_servicios_liquidada_no_se_borra
BEFORE DELETE ON "atencion_servicios"
FOR EACH ROW EXECUTE FUNCTION atencion_servicios_liquidada_no_se_borra();


-- ─── Trigger: producto y liquidación, del mismo negocio que la atención ────
-- `atencion_servicios` no tiene `businessId` propio, así que las FK a
-- `productos` y `liquidaciones` no pueden ser compuestas como las de
-- `atencion_propinas`. Esto cubre ese hueco: una línea nunca apunta a un
-- producto ni a una liquidación de otro negocio.
CREATE FUNCTION atencion_servicios_mismo_negocio() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  negocio TEXT;
BEGIN
  IF NEW."productId" IS NULL AND NEW."liquidacionId" IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW."visitId" = OLD."visitId"
     AND NEW."productId" IS NOT DISTINCT FROM OLD."productId"
     AND NEW."liquidacionId" IS NOT DISTINCT FROM OLD."liquidacionId" THEN
    RETURN NEW;
  END IF;

  SELECT "businessId" INTO negocio FROM "atenciones" WHERE "id" = NEW."visitId";

  IF NEW."productId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "productos" WHERE "id" = NEW."productId" AND "businessId" = negocio
  ) THEN
    RAISE EXCEPTION 'atencion_servicios %: el producto es de otro negocio', NEW."id"
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW."liquidacionId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "liquidaciones" WHERE "id" = NEW."liquidacionId" AND "businessId" = negocio
  ) THEN
    RAISE EXCEPTION 'atencion_servicios %: la liquidación es de otro negocio', NEW."id"
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER atencion_servicios_mismo_negocio
BEFORE INSERT OR UPDATE ON "atencion_servicios"
FOR EACH ROW EXECUTE FUNCTION atencion_servicios_mismo_negocio();

COMMIT;
