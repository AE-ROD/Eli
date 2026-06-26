-- CreateEnum
CREATE TYPE "ShiftNoteType" AS ENUM ('INCIDENTE', 'OBSERVACION', 'PENDIENTE', 'TRANSFERENCIA', 'RECORDATORIO');

-- CreateEnum
CREATE TYPE "ShiftNotePriority" AS ENUM ('NORMAL', 'ALTA', 'URGENTE');

-- CreateEnum
CREATE TYPE "ShiftNoteStatus" AS ENUM ('ACTIVA', 'EN_PROGRESO', 'RESUELTA', 'TRANSFERIDA', 'ARCHIVADA');

-- CreateEnum
CREATE TYPE "ShiftCloseStatus" AS ENUM ('BORRADOR', 'CERRADO', 'REVISADO');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('EFECTIVO', 'TARJETA_DEBITO', 'TARJETA_CREDITO', 'TRANSFERENCIA', 'OTRO');

-- AlterTable
ALTER TABLE "miembros_negocio" ADD COLUMN     "customRoleId" TEXT,
ADD COLUMN     "isOwner" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "permissions" JSONB;

-- CreateTable
CREATE TABLE "roles_negocio" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_negocio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notas_turno" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "assignedTo" TEXT,
    "resolvedBy" TEXT,
    "type" "ShiftNoteType" NOT NULL,
    "priority" "ShiftNotePriority" NOT NULL DEFAULT 'NORMAL',
    "status" "ShiftNoteStatus" NOT NULL DEFAULT 'ACTIVA',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "shiftDate" TIMESTAMP(3) NOT NULL,
    "shiftPeriod" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "transferredToDate" TIMESTAMP(3),
    "seenBy" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notas_turno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cierres_turno" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "closedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "shiftDate" TIMESTAMP(3) NOT NULL,
    "shiftPeriod" TEXT,
    "shiftStartTime" TIMESTAMP(3),
    "shiftEndTime" TIMESTAMP(3),
    "status" "ShiftCloseStatus" NOT NULL DEFAULT 'BORRADOR',
    "appointmentsTotal" INTEGER NOT NULL DEFAULT 0,
    "appointmentsCompleted" INTEGER NOT NULL DEFAULT 0,
    "appointmentsCancelled" INTEGER NOT NULL DEFAULT 0,
    "appointmentsNoShow" INTEGER NOT NULL DEFAULT 0,
    "appointmentsPending" INTEGER NOT NULL DEFAULT 0,
    "expectedRevenue" DECIMAL(10,2),
    "declaredRevenue" DECIMAL(10,2),
    "discrepancy" DECIMAL(10,2),
    "cashOpening" DECIMAL(10,2),
    "cashClosing" DECIMAL(10,2),
    "cashWithdrawals" DECIMAL(10,2),
    "cashDeposits" DECIMAL(10,2),
    "paymentBreakdown" JSONB,
    "tipsTotal" DECIMAL(10,2),
    "tipsBreakdown" JSONB,
    "pendingItems" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "observations" TEXT,
    "reviewNotes" TEXT,
    "closedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cierres_turno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reportes_guardados" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "reportType" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reportes_guardados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reportes_programados" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reportType" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "frequency" TEXT NOT NULL,
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "sendTime" TEXT NOT NULL,
    "recipients" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSentAt" TIMESTAMP(3),
    "nextSendAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reportes_programados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "roles_negocio_businessId_idx" ON "roles_negocio"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "roles_negocio_businessId_name_key" ON "roles_negocio"("businessId", "name");

-- CreateIndex
CREATE INDEX "notas_turno_businessId_shiftDate_idx" ON "notas_turno"("businessId", "shiftDate");

-- CreateIndex
CREATE INDEX "notas_turno_businessId_status_idx" ON "notas_turno"("businessId", "status");

-- CreateIndex
CREATE INDEX "notas_turno_authorId_idx" ON "notas_turno"("authorId");

-- CreateIndex
CREATE INDEX "cierres_turno_businessId_shiftDate_idx" ON "cierres_turno"("businessId", "shiftDate");

-- CreateIndex
CREATE INDEX "cierres_turno_closedById_idx" ON "cierres_turno"("closedById");

-- CreateIndex
CREATE UNIQUE INDEX "cierres_turno_businessId_shiftDate_shiftPeriod_closedById_key" ON "cierres_turno"("businessId", "shiftDate", "shiftPeriod", "closedById");

-- CreateIndex
CREATE INDEX "reportes_guardados_businessId_idx" ON "reportes_guardados"("businessId");

-- CreateIndex
CREATE INDEX "reportes_programados_businessId_idx" ON "reportes_programados"("businessId");

-- CreateIndex
CREATE INDEX "reportes_programados_nextSendAt_isActive_idx" ON "reportes_programados"("nextSendAt", "isActive");

-- CreateIndex
CREATE INDEX "miembros_negocio_customRoleId_idx" ON "miembros_negocio"("customRoleId");

-- AddForeignKey
ALTER TABLE "roles_negocio" ADD CONSTRAINT "roles_negocio_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miembros_negocio" ADD CONSTRAINT "miembros_negocio_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "roles_negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_turno" ADD CONSTRAINT "notas_turno_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_turno" ADD CONSTRAINT "notas_turno_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "miembros_negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_turno" ADD CONSTRAINT "notas_turno_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "miembros_negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notas_turno" ADD CONSTRAINT "notas_turno_resolvedBy_fkey" FOREIGN KEY ("resolvedBy") REFERENCES "miembros_negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierres_turno" ADD CONSTRAINT "cierres_turno_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierres_turno" ADD CONSTRAINT "cierres_turno_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "miembros_negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cierres_turno" ADD CONSTRAINT "cierres_turno_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "miembros_negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reportes_guardados" ADD CONSTRAINT "reportes_guardados_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reportes_guardados" ADD CONSTRAINT "reportes_guardados_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "miembros_negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reportes_programados" ADD CONSTRAINT "reportes_programados_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reportes_programados" ADD CONSTRAINT "reportes_programados_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "miembros_negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DataMigration: crear fila en miembros_negocio para cada owner existente
-- (Business.userId), que hasta ahora se identificaba solo por esa FK directa
-- y nunca tenía fila en miembros_negocio. Sin esto, getSessionMember()
-- devuelve null para todo dueño de negocio y rompe el sistema de permisos.
INSERT INTO "miembros_negocio" ("id", "businessId", "userId", "role", "isOwner", "createdAt")
SELECT
  'mbr_' || substr(md5(random()::text || n."id"), 1, 20),
  n."id",
  n."userId",
  'admin',
  true,
  n."createdAt"
FROM "negocios" n
WHERE NOT EXISTS (
  SELECT 1 FROM "miembros_negocio" m
  WHERE m."businessId" = n."id" AND m."userId" = n."userId"
);
