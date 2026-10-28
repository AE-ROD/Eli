-- Etapa 3 "Avisos por correo": una sola migración para toda la etapa.
-- Aditiva y sin pérdida: agrega columnas nullable o con default, un único
-- (id, businessId) en clientes, dos tablas nuevas con sus índices y claves
-- foráneas, y CHECKs. No toca ni reescribe filas existentes, así que el código
-- viejo sigue funcionando con ella aplicada.
--
-- Lo que agrega:
--   negocios: enlace de reseñas de Google y los tres interruptores de los
--     mensajes a clientes (lista de espera encendida; "te toca" y reseñas
--     apagadas).
--   servicios: frecuencia en días (7..365) para "te toca".
--   clientes: consentimiento promocional por correo (cuándo, por dónde y
--     cuándo se dio de baja) y un único (id, businessId).
--   lista_de_espera: "Avísame si se libera una hora" (#74). El servicio es FK
--     compuesta (id, businessId) y CASCADE; el profesional, FK simple SET NULL.
--   envios_a_clientes: registro, candado y contador de los mensajes (#78). Su
--     único (businessId, tipo, referencia) es el candado. Sin datos personales.
--
-- Va entera en una transacción explícita: si algo falla a mitad, no queda
-- aplicada a medias. Se aplica con psql (`-v ON_ERROR_STOP=1`). Orden de
-- despliegue: README.md, sección "Migraciones en producción".
BEGIN;
-- AlterTable
ALTER TABLE "negocios" ADD COLUMN     "avisoDeVueltaActivo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "enlaceResenas" TEXT,
ADD COLUMN     "listaDeEsperaActiva" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pideResenas" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "correoPromoBajaAt" TIMESTAMP(3),
ADD COLUMN     "correoPromoConsentAt" TIMESTAMP(3),
ADD COLUMN     "correoPromoConsentSource" TEXT;

-- AlterTable
ALTER TABLE "servicios" ADD COLUMN     "frecuenciaDias" INTEGER;

-- CreateTable
CREATE TABLE "lista_de_espera" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "memberId" TEXT,
    "fecha" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefono" TEXT,
    "whatsappConsentAt" TIMESTAMP(3),
    "estado" TEXT NOT NULL DEFAULT 'activa',
    "avisos" INTEGER NOT NULL DEFAULT 0,
    "ultimoAvisoAt" TIMESTAMP(3),
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resueltaAt" TIMESTAMP(3),

    CONSTRAINT "lista_de_espera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "envios_a_clientes" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT,
    "esperaId" TEXT,
    "tipo" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "referencia" TEXT NOT NULL,
    "enviadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "envios_a_clientes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lista_de_espera_tokenHash_key" ON "lista_de_espera"("tokenHash");

-- CreateIndex
CREATE INDEX "lista_de_espera_businessId_fecha_estado_idx" ON "lista_de_espera"("businessId", "fecha", "estado");

-- CreateIndex
CREATE INDEX "lista_de_espera_businessId_email_idx" ON "lista_de_espera"("businessId", "email");

-- CreateIndex
CREATE INDEX "envios_a_clientes_businessId_enviadoAt_idx" ON "envios_a_clientes"("businessId", "enviadoAt");

-- CreateIndex
CREATE INDEX "envios_a_clientes_customerId_tipo_enviadoAt_idx" ON "envios_a_clientes"("customerId", "tipo", "enviadoAt");

-- CreateIndex
CREATE INDEX "envios_a_clientes_esperaId_idx" ON "envios_a_clientes"("esperaId");

-- CreateIndex
CREATE UNIQUE INDEX "envios_a_clientes_businessId_tipo_referencia_key" ON "envios_a_clientes"("businessId", "tipo", "referencia");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_id_businessId_key" ON "clientes"("id", "businessId");

-- AddForeignKey
ALTER TABLE "lista_de_espera" ADD CONSTRAINT "lista_de_espera_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lista_de_espera" ADD CONSTRAINT "lista_de_espera_serviceId_businessId_fkey" FOREIGN KEY ("serviceId", "businessId") REFERENCES "servicios"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lista_de_espera" ADD CONSTRAINT "lista_de_espera_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "miembros_negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios_a_clientes" ADD CONSTRAINT "envios_a_clientes_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios_a_clientes" ADD CONSTRAINT "envios_a_clientes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios_a_clientes" ADD CONSTRAINT "envios_a_clientes_esperaId_fkey" FOREIGN KEY ("esperaId") REFERENCES "lista_de_espera"("id") ON DELETE SET NULL ON UPDATE CASCADE;




-- ─── Restricciones CHECK, escritas a mano ───────────────────────────────────
-- Prisma no las representa en el esquema (ver la migración del tablero). Son
-- la segunda barrera, porque no hay RLS. Si alguien corre `migrate dev`,
-- revisar que no las borre por "drift".

-- servicios: null es "sin frecuencia" (no se avisa), no 0.
ALTER TABLE "servicios" ADD CONSTRAINT "servicios_frecuenciaDias_check" CHECK ("frecuenciaDias" IS NULL OR ("frecuenciaDias" >= 7 AND "frecuenciaDias" <= 365));

-- clientes: el origen del consentimiento promocional, y nunca un origen sin fecha.
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_correoPromoConsentSource_check" CHECK ("correoPromoConsentSource" IS NULL OR "correoPromoConsentSource" IN ('reserva-publica', 'panel'));
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_correoPromoConsent_coherente_check" CHECK (("correoPromoConsentAt" IS NULL) = ("correoPromoConsentSource" IS NULL));

-- lista_de_espera
ALTER TABLE "lista_de_espera" ADD CONSTRAINT "lista_de_espera_fecha_check" CHECK ("fecha" ~ '^\d{4}-\d{2}-\d{2}$');
ALTER TABLE "lista_de_espera" ADD CONSTRAINT "lista_de_espera_estado_check" CHECK ("estado" IN ('activa', 'reservo', 'expirada', 'salio'));
ALTER TABLE "lista_de_espera" ADD CONSTRAINT "lista_de_espera_avisos_check" CHECK ("avisos" >= 0);

-- envios_a_clientes
ALTER TABLE "envios_a_clientes" ADD CONSTRAINT "envios_a_clientes_tipo_check" CHECK ("tipo" IN ('lista-de-espera', 'te-toca', 'resena', 'contacto-manual'));
ALTER TABLE "envios_a_clientes" ADD CONSTRAINT "envios_a_clientes_canal_check" CHECK ("canal" IN ('correo', 'whatsapp', 'manual'));
ALTER TABLE "envios_a_clientes" ADD CONSTRAINT "envios_a_clientes_categoria_check" CHECK ("categoria" IN ('servicio', 'promocional'));

COMMIT;
