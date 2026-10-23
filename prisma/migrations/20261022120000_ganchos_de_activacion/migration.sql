-- Ganchos de activación: correos del ciclo de prueba, lista "Deja tu negocio
-- listo" y referidos. Aditiva y sin pérdida: sólo agrega columnas, una tabla y
-- sus índices. Las columnas NOT NULL sin default verdadero se agregan nullable,
-- se rellenan y recién después se cierran.

-- Va entera en una transacción explícita: si algo falla a mitad (p. ej. el
-- índice único de "codigoInvitacion" choca), no queda aplicada a medias. Se
-- aplica con psql (`-v ON_ERROR_STOP=1`), que corta en el primer error y
-- Postgres deshace la transacción. Orden de despliegue: README.md, sección
-- "Migraciones en producción".
BEGIN;

-- ─── Usuarios: baja de los correos del ciclo de prueba ──────────────────────

ALTER TABLE "usuarios" ADD COLUMN "correosDesactivados" BOOLEAN NOT NULL DEFAULT false;

-- ─── Negocios ───────────────────────────────────────────────────────────────

-- Correos de prueba: los negocios que ya existen quedan en false (no se les
-- manda una bienvenida tardía) y los que se creen desde ahora, en true.
ALTER TABLE "negocios" ADD COLUMN "recibeCorreosDePrueba" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "negocios" ALTER COLUMN "recibeCorreosDePrueba" SET DEFAULT true;

-- Lista "Deja tu negocio listo": cuándo se copió el enlace de reservas.
ALTER TABLE "negocios" ADD COLUMN "enlaceCompartidoAt" TIMESTAMP(3);

-- Fin de la prueba gratis, guardado (un referido lo corre). Para los negocios
-- existentes vale lo que el panel calculaba hasta hoy: createdAt + 7 días
-- (DIAS_DE_PRUEBA en lib/precios.ts). Sin default: los nuevos lo fija el código
-- al crear el negocio.
ALTER TABLE "negocios" ADD COLUMN "pruebaTerminaEl" TIMESTAMP(3);
UPDATE "negocios" SET "pruebaTerminaEl" = "createdAt" + interval '7 days';
ALTER TABLE "negocios" ALTER COLUMN "pruebaTerminaEl" SET NOT NULL;

-- Código del enlace de invitación. Los nuevos los genera la app con
-- node:crypto (lib/prueba.ts: 10 caracteres de base32 Crockford en minúscula).
-- Para los existentes no se usa pgcrypto (ninguna migración lo habilita y no se
-- agregan extensiones): 10 caracteres hex de md5 sobre random(), la hora del
-- reloj y el id. Hex es un subconjunto del alfabeto de la app, así que todos los
-- códigos se ven iguales. Si dos chocaran (≈ 2^-40 por par), el índice único de
-- abajo hace fallar la migración entera en vez de dejar un duplicado.
ALTER TABLE "negocios" ADD COLUMN "codigoInvitacion" TEXT;
UPDATE "negocios"
SET "codigoInvitacion" = substr(md5(random()::text || clock_timestamp()::text || "id"), 1, 10);
ALTER TABLE "negocios" ALTER COLUMN "codigoInvitacion" SET NOT NULL;

-- Referidos: quién invitó a este negocio, y las dos marcas que hacen que el
-- referido cuente una sola vez (en el invitado) y que los días extra se den una
-- sola vez en total (en quien invita).
ALTER TABLE "negocios" ADD COLUMN "invitadoPorId" TEXT;
ALTER TABLE "negocios" ADD COLUMN "referidoContabilizadoAt" TIMESTAMP(3);
ALTER TABLE "negocios" ADD COLUMN "extensionPorReferidoAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "negocios_codigoInvitacion_key" ON "negocios"("codigoInvitacion");

-- CreateIndex
CREATE INDEX "negocios_invitadoPorId_idx" ON "negocios"("invitadoPorId");

-- AddForeignKey: borrar a quien invitó deja al invitado sin padrino, no lo borra.
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_invitadoPorId_fkey" FOREIGN KEY ("invitadoPorId") REFERENCES "negocios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Correos del ciclo de prueba ya enviados ────────────────────────────────
--
-- Una fila por (negocio, tipo): el índice único es lo que impide mandar dos
-- veces el mismo correo ("bienvenida", "consejo", "quedan-3-dias",
-- "termina-hoy").

-- CreateTable
CREATE TABLE "correos_de_cuenta" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "enviadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "correos_de_cuenta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "correos_de_cuenta_businessId_tipo_key" ON "correos_de_cuenta"("businessId", "tipo");

-- AddForeignKey
ALTER TABLE "correos_de_cuenta" ADD CONSTRAINT "correos_de_cuenta_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
