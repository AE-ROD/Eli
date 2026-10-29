-- Etapa 5 "Reservas a medida": una sola migración para toda la etapa.
-- Aditiva y sin pérdida: dos columnas con default, un único (id, businessId)
-- en citas, dos tablas nuevas, CHECKs y un trigger. No toca ni reescribe filas
-- existentes (las citas de antes quedan sin filas en cita_servicios y se leen
-- por serviceId, como hoy), así que el código viejo sigue funcionando con ella
-- aplicada.
--
-- Lo que agrega:
--   negocios: la opción de precios de hora valle (#89c), apagada por defecto.
--   servicios: la marca para excluir un servicio de la hora valle.
--   citas: único (id, businessId), para la FK compuesta de cita_servicios.
--   cita_servicios (#89a): los servicios de una cita con varios (hasta 4,
--     orden 1..4), con nombre, duración y precio copiados al reservar.
--   franjas_de_hora_valle (#89c): % de rebaja por día y franja "HH:MM".
--
-- Va entera en una transacción explícita: si algo falla a mitad, no queda
-- aplicada a medias. Se aplica con psql (`-v ON_ERROR_STOP=1`). Orden de
-- despliegue: README.md, sección "Migraciones en producción".
BEGIN;
-- AlterTable
ALTER TABLE "negocios" ADD COLUMN     "horaValleActiva" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "servicios" ADD COLUMN     "excluidoDeHoraValle" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "cita_servicios" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "serviceId" TEXT,
    "serviceName" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "price" DOUBLE PRECISION,
    "orden" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cita_servicios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "franjas_de_hora_valle" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "desde" TEXT NOT NULL,
    "hasta" TEXT NOT NULL,
    "porcentaje" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "franjas_de_hora_valle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cita_servicios_businessId_idx" ON "cita_servicios"("businessId");

-- CreateIndex
CREATE INDEX "cita_servicios_serviceId_idx" ON "cita_servicios"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "cita_servicios_appointmentId_orden_key" ON "cita_servicios"("appointmentId", "orden");

-- CreateIndex
CREATE INDEX "franjas_de_hora_valle_businessId_dayOfWeek_idx" ON "franjas_de_hora_valle"("businessId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "citas_id_businessId_key" ON "citas"("id", "businessId");

-- AddForeignKey
ALTER TABLE "cita_servicios" ADD CONSTRAINT "cita_servicios_appointmentId_businessId_fkey" FOREIGN KEY ("appointmentId", "businessId") REFERENCES "citas"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cita_servicios" ADD CONSTRAINT "cita_servicios_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cita_servicios" ADD CONSTRAINT "cita_servicios_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "servicios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "franjas_de_hora_valle" ADD CONSTRAINT "franjas_de_hora_valle_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;




-- ─── Restricciones CHECK y trigger, escritos a mano ─────────────────────────
-- Prisma no las representa en el esquema (ver la migración del tablero). Son
-- la segunda barrera, porque no hay RLS. Si alguien corre `migrate dev`,
-- revisar que no las borre por "drift".

-- cita_servicios: hasta 4 servicios por cita, y lo copiado con sentido.
ALTER TABLE "cita_servicios" ADD CONSTRAINT "cita_servicios_orden_check" CHECK ("orden" >= 1 AND "orden" <= 4);
ALTER TABLE "cita_servicios" ADD CONSTRAINT "cita_servicios_duration_check" CHECK ("duration" > 0 AND "duration" <= 1440);
ALTER TABLE "cita_servicios" ADD CONSTRAINT "cita_servicios_price_check" CHECK ("price" IS NULL OR "price" >= 0);
ALTER TABLE "cita_servicios" ADD CONSTRAINT "cita_servicios_serviceName_check" CHECK (length(btrim("serviceName")) > 0);

-- franjas_de_hora_valle: día como WorkSchedule, "HH:MM" de 00:00 a 23:59 (la
-- comparación de texto ordena bien con ese formato fijo), y el %.
ALTER TABLE "franjas_de_hora_valle" ADD CONSTRAINT "franjas_de_hora_valle_dayOfWeek_check" CHECK ("dayOfWeek" >= 0 AND "dayOfWeek" <= 6);
ALTER TABLE "franjas_de_hora_valle" ADD CONSTRAINT "franjas_de_hora_valle_desde_check" CHECK ("desde" ~ '^([01]\d|2[0-3]):[0-5]\d$');
ALTER TABLE "franjas_de_hora_valle" ADD CONSTRAINT "franjas_de_hora_valle_hasta_check" CHECK ("hasta" ~ '^([01]\d|2[0-3]):[0-5]\d$');
ALTER TABLE "franjas_de_hora_valle" ADD CONSTRAINT "franjas_de_hora_valle_orden_check" CHECK ("desde" < "hasta");
ALTER TABLE "franjas_de_hora_valle" ADD CONSTRAINT "franjas_de_hora_valle_porcentaje_check" CHECK ("porcentaje" >= 5 AND "porcentaje" <= 90);

-- cita_servicios: el servicio copiado es del mismo negocio que la fila. La FK
-- del servicio es simple (SetNull en una compuesta anularía también
-- businessId), así que esto lo cubre un trigger. Con serviceId en null (o
-- puesto en null por la cascada al borrar el servicio) no hay nada que
-- comparar.
CREATE FUNCTION cita_servicios_mismo_negocio() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."serviceId" IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "servicios" WHERE "id" = NEW."serviceId" AND "businessId" = NEW."businessId"
  ) THEN
    RAISE EXCEPTION 'cita_servicios %: el servicio es de otro negocio', NEW."id"
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER cita_servicios_mismo_negocio
BEFORE INSERT OR UPDATE OF "serviceId", "businessId" ON "cita_servicios"
FOR EACH ROW EXECUTE FUNCTION cita_servicios_mismo_negocio();

COMMIT;
