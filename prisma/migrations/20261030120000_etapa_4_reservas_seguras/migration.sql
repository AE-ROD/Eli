-- Etapa 4 "Reservas seguras": una sola migración para toda la etapa.
-- Aditiva y sin pérdida: agrega columnas nullable o con default, dos únicos
-- en atenciones y CHECKs. No toca ni reescribe filas existentes (todas quedan
-- con origen 'tablero' y las columnas fila* en null, que cumplen las CHECKs),
-- así que el código viejo sigue funcionando con ella aplicada.
--
-- Lo que agrega:
--   negocios: con cuántas faltas una reserva pública entra por confirmar
--     (#84; null = apagado) y la fila virtual (#85): encendida (apagada por
--     defecto) y su tope de personas esperando (15).
--   citas: la marca de que la reserva entró por confirmar por faltas. Toda
--     reserva pública nace 'pendiente', así que el status solo no lo dice.
--   atenciones: quien se anota en la fila virtual es una atención 'en-espera'
--     con origen 'fila', el hash de su token, correo opcional, día y número
--     de turno, y cuándo se le avisó. Único por (negocio, día, número) para
--     numerar sin repetir; las del Tablero tienen null y no chocan.
--
-- Va entera en una transacción explícita: si algo falla a mitad, no queda
-- aplicada a medias. Se aplica con psql (`-v ON_ERROR_STOP=1`). Orden de
-- despliegue: README.md, sección "Migraciones en producción".
BEGIN;
-- AlterTable
ALTER TABLE "negocios" ADD COLUMN     "filaVirtualActiva" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "filaVirtualTope" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "porConfirmarTrasFaltas" INTEGER;

-- AlterTable
ALTER TABLE "citas" ADD COLUMN     "confirmacionPorFaltas" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "atenciones" ADD COLUMN     "filaAvisadaAt" TIMESTAMP(3),
ADD COLUMN     "filaEmail" TEXT,
ADD COLUMN     "filaFecha" TEXT,
ADD COLUMN     "filaNumero" INTEGER,
ADD COLUMN     "filaTokenHash" TEXT,
ADD COLUMN     "origen" TEXT NOT NULL DEFAULT 'tablero';

-- CreateIndex
CREATE UNIQUE INDEX "atenciones_filaTokenHash_key" ON "atenciones"("filaTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "atenciones_businessId_filaFecha_filaNumero_key" ON "atenciones"("businessId", "filaFecha", "filaNumero");




-- ─── Restricciones CHECK, escritas a mano ───────────────────────────────────
-- Prisma no las representa en el esquema (ver la migración del tablero). Son
-- la segunda barrera, porque no hay RLS. Si alguien corre `migrate dev`,
-- revisar que no las borre por "drift".

-- negocios: null es "apagado", no 0.
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_porConfirmarTrasFaltas_check" CHECK ("porConfirmarTrasFaltas" IS NULL OR ("porConfirmarTrasFaltas" >= 1 AND "porConfirmarTrasFaltas" <= 20));
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_filaVirtualTope_check" CHECK ("filaVirtualTope" >= 1 AND "filaVirtualTope" <= 100);

-- atenciones: el origen, y las columnas de la fila coherentes con él. Fuera de
-- la fila, todas en null; dentro, token, día y número siempre presentes.
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_origen_check" CHECK ("origen" IN ('tablero', 'fila'));
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_fila_coherente_check" CHECK (
  ("origen" = 'tablero' AND "filaTokenHash" IS NULL AND "filaEmail" IS NULL AND "filaFecha" IS NULL AND "filaNumero" IS NULL AND "filaAvisadaAt" IS NULL)
  OR
  ("origen" = 'fila' AND "filaTokenHash" IS NOT NULL AND "filaFecha" IS NOT NULL AND "filaNumero" IS NOT NULL)
);
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_filaFecha_check" CHECK ("filaFecha" IS NULL OR "filaFecha" ~ '^\d{4}-\d{2}-\d{2}$');
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_filaNumero_check" CHECK ("filaNumero" IS NULL OR "filaNumero" >= 1);

COMMIT;
