-- Etapa 1 "Antes de salir a vender": una sola migración para toda la etapa.
-- Aditiva y sin pérdida: agrega columnas nullable o con default, crea dos
-- tablas nuevas (member_services, time_blocks) con sus índices y claves
-- foráneas, y un CHECK sobre la tabla nueva. No toca ni reescribe filas
-- existentes, así que el código viejo sigue funcionando con ella aplicada.
--
-- Lo que agrega:
--   negocios: datos de la mini página pública (dirección, comuna, whatsapp,
--     instagram, color, logo, portada, medios de pago) y el plazo para que el
--     cliente cancele o reagende (cancelacionHorasAntes, default 24).
--   miembros_negocio: especialidad y foto del profesional.
--   clientes: consentimiento de WhatsApp (cuándo y por dónde).
--   servicios: categoría.
--   citas: hash del token del enlace de cancelar/reagendar, quién y cuándo
--     canceló, y cuándo salió el recordatorio. El estado nuevo "no-asistio" no
--     necesita cambios: `status` es texto sin CHECK y lo valida la app.
--   member_services: qué servicios hace cada profesional (sin filas = todos).
--   time_blocks: bloqueos de horario por profesional o de todo el negocio.
--
-- Va entera en una transacción explícita: si algo falla a mitad, no queda
-- aplicada a medias. Se aplica con psql (`-v ON_ERROR_STOP=1`). Orden de
-- despliegue: README.md, sección "Migraciones en producción".
BEGIN;
-- AlterTable
ALTER TABLE "negocios" ADD COLUMN     "address" TEXT,
ADD COLUMN     "cancelacionHorasAntes" INTEGER NOT NULL DEFAULT 24,
ADD COLUMN     "color" TEXT,
ADD COLUMN     "comuna" TEXT,
ADD COLUMN     "coverUrl" TEXT,
ADD COLUMN     "instagram" TEXT,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "mediosDePago" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "whatsapp" TEXT;

-- AlterTable
ALTER TABLE "miembros_negocio" ADD COLUMN     "especialidad" TEXT,
ADD COLUMN     "fotoUrl" TEXT;

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "whatsappConsentAt" TIMESTAMP(3),
ADD COLUMN     "whatsappConsentSource" TEXT;

-- AlterTable
ALTER TABLE "servicios" ADD COLUMN     "category" TEXT;

-- AlterTable
ALTER TABLE "citas" ADD COLUMN     "canceladaEn" TIMESTAMP(3),
ADD COLUMN     "canceladaPor" TEXT,
ADD COLUMN     "manageTokenHash" TEXT,
ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "member_services" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_blocks" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "memberId" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "motivo" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "time_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_services_businessId_idx" ON "member_services"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "member_services_memberId_serviceId_key" ON "member_services"("memberId", "serviceId");

-- CreateIndex
CREATE INDEX "time_blocks_businessId_startTime_idx" ON "time_blocks"("businessId", "startTime");

-- CreateIndex
CREATE INDEX "time_blocks_memberId_startTime_idx" ON "time_blocks"("memberId", "startTime");

-- CreateIndex
CREATE UNIQUE INDEX "citas_manageTokenHash_key" ON "citas"("manageTokenHash");

-- AddForeignKey
ALTER TABLE "member_services" ADD CONSTRAINT "member_services_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_services" ADD CONSTRAINT "member_services_memberId_businessId_fkey" FOREIGN KEY ("memberId", "businessId") REFERENCES "miembros_negocio"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_services" ADD CONSTRAINT "member_services_serviceId_businessId_fkey" FOREIGN KEY ("serviceId", "businessId") REFERENCES "servicios"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_blocks" ADD CONSTRAINT "time_blocks_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_blocks" ADD CONSTRAINT "time_blocks_memberId_businessId_fkey" FOREIGN KEY ("memberId", "businessId") REFERENCES "miembros_negocio"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─── Restricciones CHECK, escritas a mano ───────────────────────────────────
-- Prisma no las representa en el esquema. Un bloqueo vacío o al revés no
-- bloquea nada y confunde el cálculo de choques: la base lo rechaza.
ALTER TABLE "time_blocks" ADD CONSTRAINT "time_blocks_endTime_check" CHECK ("endTime" > "startTime");

COMMIT;
