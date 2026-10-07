-- CreateTable
CREATE TABLE "atenciones" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "appointmentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'en-espera',
    "notes" TEXT,
    "arrivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "totalCents" INTEGER,
    "createdById" TEXT,
    "paidById" TEXT,
    "voidedById" TEXT,

    CONSTRAINT "atenciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "atencion_servicios" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "serviceId" TEXT,
    "serviceName" TEXT NOT NULL,
    "memberId" TEXT,
    "byOwner" BOOLEAN NOT NULL DEFAULT false,
    "professionalName" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,

    CONSTRAINT "atencion_servicios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "atencion_pagos" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "atencion_pagos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "atenciones_appointmentId_key" ON "atenciones"("appointmentId");

-- CreateIndex
CREATE INDEX "atenciones_businessId_status_idx" ON "atenciones"("businessId", "status");

-- CreateIndex
CREATE INDEX "atenciones_businessId_paidAt_idx" ON "atenciones"("businessId", "paidAt");

-- CreateIndex
CREATE INDEX "atenciones_customerId_idx" ON "atenciones"("customerId");

-- CreateIndex
CREATE INDEX "atencion_servicios_visitId_idx" ON "atencion_servicios"("visitId");

-- CreateIndex
CREATE INDEX "atencion_servicios_memberId_idx" ON "atencion_servicios"("memberId");

-- CreateIndex
CREATE INDEX "atencion_pagos_visitId_idx" ON "atencion_pagos"("visitId");

-- AddForeignKey
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "citas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atencion_servicios" ADD CONSTRAINT "atencion_servicios_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "atenciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atencion_servicios" ADD CONSTRAINT "atencion_servicios_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "servicios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atencion_servicios" ADD CONSTRAINT "atencion_servicios_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "miembros_negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atencion_pagos" ADD CONSTRAINT "atencion_pagos_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "atenciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

