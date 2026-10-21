-- De dónde viene cada cita: "panel" (la crea el equipo del negocio) o
-- "reserva-publica" (la página /reservar/[slug]). Hasta ahora la cita no lo
-- guardaba y los topes anti-abuso reconocían una reserva pública por tener
-- `serviceId`: si el panel empezara a guardar el servicio, los topes contarían
-- también sus citas. Aditiva y sin pérdida.

-- AlterTable
ALTER TABLE "citas" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'panel';

-- Backfill con la regla que regía hasta hoy: sólo `confirmar` creaba citas con
-- servicio, así que toda cita con `serviceId` es una reserva pública.
UPDATE "citas" SET "source" = 'reserva-publica' WHERE "serviceId" IS NOT NULL;

-- ─── Restricción CHECK, escrita a mano ──────────────────────────────────────
--
-- Prisma no representa restricciones CHECK en schema.prisma (ver la migración
-- del tablero): va acá, y si cambian los orígenes hace falta otra migración.

-- El origen: uno de los dos de ORIGENES_DE_CITA (`lib/reserva-publica.ts`).
ALTER TABLE "citas" ADD CONSTRAINT "citas_source_check" CHECK ("source" IN ('panel', 'reserva-publica'));
