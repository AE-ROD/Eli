-- AlterTable
ALTER TABLE "citas" ADD COLUMN     "commissionAmount" DOUBLE PRECISION,
ADD COLUMN     "commissionAt" TIMESTAMP(3),
ADD COLUMN     "commissionPercent" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "miembros_negocio" ADD COLUMN     "commissionPercent" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "porcentajes_comision" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "porcentajes_comision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cambios_comision" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "serviceId" TEXT,
    "changedById" TEXT NOT NULL,
    "previousPercent" DOUBLE PRECISION,
    "newPercent" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cambios_comision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "porcentajes_comision_businessId_idx" ON "porcentajes_comision"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "porcentajes_comision_memberId_serviceId_key" ON "porcentajes_comision"("memberId", "serviceId");

-- CreateIndex
CREATE INDEX "cambios_comision_businessId_idx" ON "cambios_comision"("businessId");

-- CreateIndex
CREATE INDEX "cambios_comision_memberId_createdAt_idx" ON "cambios_comision"("memberId", "createdAt");

-- AddForeignKey
ALTER TABLE "porcentajes_comision" ADD CONSTRAINT "porcentajes_comision_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "porcentajes_comision" ADD CONSTRAINT "porcentajes_comision_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "miembros_negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "porcentajes_comision" ADD CONSTRAINT "porcentajes_comision_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "servicios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cambios_comision" ADD CONSTRAINT "cambios_comision_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cambios_comision" ADD CONSTRAINT "cambios_comision_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "miembros_negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cambios_comision" ADD CONSTRAINT "cambios_comision_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "servicios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cambios_comision" ADD CONSTRAINT "cambios_comision_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CheckConstraint
-- Defensa en profundidad: el rango 0-100 también se valida en la app (Zod, F-004),
-- pero es dinero de terceros — vale la pena que la base lo garantice igual si algún
-- día un insert la esquiva. `NULL` sigue significando "sin configurar", no viola el check.
ALTER TABLE "miembros_negocio" ADD CONSTRAINT "miembros_negocio_commissionPercent_check" CHECK ("commissionPercent" IS NULL OR ("commissionPercent" >= 0 AND "commissionPercent" <= 100));

ALTER TABLE "porcentajes_comision" ADD CONSTRAINT "porcentajes_comision_percent_check" CHECK ("percent" >= 0 AND "percent" <= 100);

ALTER TABLE "citas" ADD CONSTRAINT "citas_commissionPercent_check" CHECK ("commissionPercent" IS NULL OR ("commissionPercent" >= 0 AND "commissionPercent" <= 100));

ALTER TABLE "cambios_comision" ADD CONSTRAINT "cambios_comision_previousPercent_check" CHECK ("previousPercent" IS NULL OR ("previousPercent" >= 0 AND "previousPercent" <= 100));

ALTER TABLE "cambios_comision" ADD CONSTRAINT "cambios_comision_newPercent_check" CHECK ("newPercent" IS NULL OR ("newPercent" >= 0 AND "newPercent" <= 100));
