-- Solicitudes de soporte (falla, reclamo o consulta) desde /dashboard/ayuda y
-- /soporte. Aditiva y sin pérdida: sólo crea una tabla nueva, sus índices y
-- sus claves foráneas; no toca columnas ni filas existentes.

-- Va entera en una transacción explícita: si algo falla a mitad, no queda
-- aplicada a medias. Se aplica con psql (`-v ON_ERROR_STOP=1`), que corta en
-- el primer error y Postgres deshace la transacción. Orden de despliegue:
-- README.md, sección "Migraciones en producción".
BEGIN;

-- CreateTable
CREATE TABLE "solicitudes_de_soporte" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "asunto" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "dondeOcurrio" TEXT,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "businessId" TEXT,
    "userId" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'recibida',
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitudes_de_soporte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "solicitudes_de_soporte_numero_key" ON "solicitudes_de_soporte"("numero");

-- CreateIndex
CREATE INDEX "solicitudes_de_soporte_businessId_idx" ON "solicitudes_de_soporte"("businessId");

-- CreateIndex
CREATE INDEX "solicitudes_de_soporte_userId_idx" ON "solicitudes_de_soporte"("userId");

-- AddForeignKey
ALTER TABLE "solicitudes_de_soporte" ADD CONSTRAINT "solicitudes_de_soporte_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitudes_de_soporte" ADD CONSTRAINT "solicitudes_de_soporte_userId_fkey" FOREIGN KEY ("userId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;


COMMIT;
