-- Zona horaria por negocio (IANA). Aditiva y sin pérdida: los negocios
-- existentes quedan en America/Santiago, la zona en la que ya operan.

-- AlterTable
ALTER TABLE "negocios" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/Santiago';
