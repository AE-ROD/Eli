-- Secretaria Eli: el agente de IA que atiende el WhatsApp de cada negocio.
-- Sólo crea tablas nuevas y amplía la CHECK del origen de las citas: no toca datos.
-- CreateTable
CREATE TABLE "canales_de_whatsapp" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "wabaId" TEXT NOT NULL,
    "accessTokenCifrado" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canales_de_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ajustes_de_secretaria" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT false,
    "maxTurnos" INTEGER NOT NULL DEFAULT 8,
    "maxTokens" INTEGER NOT NULL DEFAULT 200,
    "presupuestoMensualCentavos" INTEGER,
    "reglas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ajustes_de_secretaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversaciones_de_secretaria" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "canalId" TEXT,
    "telefono" TEXT NOT NULL,
    "customerId" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'bot',
    "turnos" INTEGER NOT NULL DEFAULT 0,
    "simulacion" BOOLEAN NOT NULL DEFAULT false,
    "motivoDerivacion" TEXT,
    "derivadaAMemberId" TEXT,
    "derivadaAt" TIMESTAMP(3),
    "ultimoMensajeAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mensajesEntrantes" INTEGER NOT NULL DEFAULT 0,
    "respondiendoHasta" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversaciones_de_secretaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensajes_de_secretaria" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "conversacionId" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "contenido" JSONB NOT NULL,
    "tokensEntrada" INTEGER NOT NULL DEFAULT 0,
    "tokensSalida" INTEGER NOT NULL DEFAULT 0,
    "waMessageId" TEXT,
    "orden" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensajes_de_secretaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consumo_de_secretaria" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "tokensEntrada" BIGINT NOT NULL DEFAULT 0,
    "tokensSalida" BIGINT NOT NULL DEFAULT 0,
    "costoMicrodolares" INTEGER NOT NULL DEFAULT 0,
    "mensajesWhatsappEnviados" INTEGER NOT NULL DEFAULT 0,
    "alerta80At" TIMESTAMP(3),
    "alerta100At" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consumo_de_secretaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avisos_del_panel" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "memberId" TEXT,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "enlace" TEXT,
    "leidoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avisos_del_panel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "canales_de_whatsapp_businessId_key" ON "canales_de_whatsapp"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "canales_de_whatsapp_phoneNumberId_key" ON "canales_de_whatsapp"("phoneNumberId");

-- CreateIndex
CREATE UNIQUE INDEX "canales_de_whatsapp_id_businessId_key" ON "canales_de_whatsapp"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "ajustes_de_secretaria_businessId_key" ON "ajustes_de_secretaria"("businessId");

-- CreateIndex
CREATE INDEX "conversaciones_de_secretaria_businessId_ultimoMensajeAt_idx" ON "conversaciones_de_secretaria"("businessId", "ultimoMensajeAt");

-- CreateIndex
CREATE UNIQUE INDEX "conversaciones_de_secretaria_id_businessId_key" ON "conversaciones_de_secretaria"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "conversaciones_de_secretaria_businessId_telefono_simulacion_key" ON "conversaciones_de_secretaria"("businessId", "telefono", "simulacion");

-- CreateIndex
CREATE UNIQUE INDEX "mensajes_de_secretaria_waMessageId_key" ON "mensajes_de_secretaria"("waMessageId");

-- CreateIndex
CREATE INDEX "mensajes_de_secretaria_conversacionId_orden_idx" ON "mensajes_de_secretaria"("conversacionId", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "consumo_de_secretaria_businessId_periodo_key" ON "consumo_de_secretaria"("businessId", "periodo");

-- CreateIndex
CREATE INDEX "avisos_del_panel_businessId_createdAt_idx" ON "avisos_del_panel"("businessId", "createdAt");

-- AddForeignKey
ALTER TABLE "canales_de_whatsapp" ADD CONSTRAINT "canales_de_whatsapp_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajustes_de_secretaria" ADD CONSTRAINT "ajustes_de_secretaria_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversaciones_de_secretaria" ADD CONSTRAINT "conversaciones_de_secretaria_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversaciones_de_secretaria" ADD CONSTRAINT "conversaciones_de_secretaria_canalId_businessId_fkey" FOREIGN KEY ("canalId", "businessId") REFERENCES "canales_de_whatsapp"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversaciones_de_secretaria" ADD CONSTRAINT "conversaciones_de_secretaria_customerId_businessId_fkey" FOREIGN KEY ("customerId", "businessId") REFERENCES "clientes"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes_de_secretaria" ADD CONSTRAINT "mensajes_de_secretaria_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mensajes_de_secretaria" ADD CONSTRAINT "mensajes_de_secretaria_conversacionId_businessId_fkey" FOREIGN KEY ("conversacionId", "businessId") REFERENCES "conversaciones_de_secretaria"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consumo_de_secretaria" ADD CONSTRAINT "consumo_de_secretaria_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avisos_del_panel" ADD CONSTRAINT "avisos_del_panel_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Los valores válidos, como en el resto del esquema.
ALTER TABLE "conversaciones_de_secretaria" ADD CONSTRAINT "conversaciones_de_secretaria_estado_check" CHECK ("estado" IN ('bot', 'human', 'closed'));
ALTER TABLE "conversaciones_de_secretaria" ADD CONSTRAINT "conversaciones_de_secretaria_turnos_check" CHECK ("turnos" >= 0);
ALTER TABLE "mensajes_de_secretaria" ADD CONSTRAINT "mensajes_de_secretaria_rol_check" CHECK ("rol" IN ('user', 'assistant'));
ALTER TABLE "ajustes_de_secretaria" ADD CONSTRAINT "ajustes_de_secretaria_topes_check" CHECK ("maxTurnos" BETWEEN 1 AND 50 AND "maxTokens" BETWEEN 50 AND 2000 AND ("presupuestoMensualCentavos" IS NULL OR "presupuestoMensualCentavos" BETWEEN 0 AND 100000));
ALTER TABLE "consumo_de_secretaria" ADD CONSTRAINT "consumo_de_secretaria_periodo_check" CHECK ("periodo" ~ '^[0-9]{4}-[0-9]{2}$');
ALTER TABLE "avisos_del_panel" ADD CONSTRAINT "avisos_del_panel_tipo_check" CHECK ("tipo" IN ('derivacion', 'presupuesto-80', 'presupuesto-100'));

-- Origen de cita nuevo: las que agenda la Secretaria por WhatsApp.
ALTER TABLE "citas" DROP CONSTRAINT "citas_source_check";
ALTER TABLE "citas" ADD CONSTRAINT "citas_source_check" CHECK ("source" IN ('panel', 'reserva-publica', 'whatsapp'));
