-- CreateTable
CREATE TABLE "importaciones_datos" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "rowsTotal" INTEGER NOT NULL DEFAULT 0,
    "rowsImported" INTEGER NOT NULL DEFAULT 0,
    "rowsSkipped" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "importaciones_datos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "importaciones_datos_businessId_idx" ON "importaciones_datos"("businessId");

-- AddForeignKey
ALTER TABLE "importaciones_datos" ADD CONSTRAINT "importaciones_datos_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "importaciones_datos" ADD CONSTRAINT "importaciones_datos_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "miembros_negocio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
