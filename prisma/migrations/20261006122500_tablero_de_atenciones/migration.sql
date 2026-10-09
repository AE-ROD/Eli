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
    "paidByName" TEXT,
    "voidedByName" TEXT,

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

-- ─── Restricciones CHECK, escritas a mano ───────────────────────────────────
--
-- La segunda barrera para el dinero (CLAUDE.md, regla 5): no hay RLS, así que
-- las reglas viven en la aplicación (lib/atenciones.ts) y esto las repite en
-- la base, para que ni un error de código ni una escritura por fuera de la
-- API dejen dinero imposible.
--
-- Prisma no representa restricciones CHECK en schema.prisma: no las genera ni
-- las borra, y `prisma migrate diff` no las compara. Por eso van acá, a mano,
-- y si cambia una de estas reglas hace falta una migración nueva.

-- El precio de una línea: cero (una cortesía) o más (`esPrecioValido`).
ALTER TABLE "atencion_servicios" ADD CONSTRAINT "atencion_servicios_priceCents_check" CHECK ("priceCents" >= 0);

-- Un pago: siempre mayor que cero (`esMontoDePagoValido`).
ALTER TABLE "atencion_pagos" ADD CONSTRAINT "atencion_pagos_amountCents_check" CHECK ("amountCents" > 0);

-- El total congelado al cobrar: null mientras la atención está abierta; si no,
-- entre 0 y TOTAL_MAXIMO_CENTAVOS (2.000.000.000, 20 millones en unidades).
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_totalCents_check" CHECK ("totalCents" IS NULL OR ("totalCents" >= 0 AND "totalCents" <= 2000000000));

-- El estado: uno de los cinco de ESTADOS_DE_ATENCION.
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_status_check" CHECK ("status" IN ('en-espera', 'en-atencion', 'por-cobrar', 'finalizada', 'anulada'));
