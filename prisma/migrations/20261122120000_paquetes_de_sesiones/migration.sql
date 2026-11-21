-- Paquetes de sesiones y rubro Centro de estética ("6 sesiones de Depilación láser por $150.000").
-- Aditiva: tres tablas nuevas y un valor más en un CHECK. No toca ni
-- reescribe ninguna fila existente.
--
-- Lo que agrega:
--   paquetes: la definición que ofrece el negocio (servicio, cuántas
--     sesiones, precio, vigencia en meses o NULL = no vence).
--   paquetes_de_clientes: el paquete que compró una clienta, con los datos
--     copiados. Nace al cobrar la atención donde se vendió
--     (`lineaDeVentaId`). El saldo no se guarda: se cuenta de sus usos.
--   usos_de_paquete: una sesión usada = una línea de una atención pagada con
--     el paquete. Una línea usa a lo más una (UNIQUE).
--   negocios_type_check: suma el rubro 'estetica' (Centro de estética). Sin
--     esto, crear un negocio de ese rubro falla.
--   atencion_pagos_method_check: suma el medio interno 'paquete', con el que
--     queda pagada la línea de una sesión usada. No es un medio que se elija
--     en la caja: lo escribe sólo el cobro (lib/paquetes-servidor.ts).
--
-- Aislamiento: las tres tablas llevan `businessId`; el paquete de la clienta
-- apunta a su clienta y a su servicio con FK compuestas (id, businessId), y
-- el uso a su paquete igual: una fila no puede mezclar negocios.
--
-- Orden de despliegue: ANTES de desplegar el código nuevo. El código viejo
-- sigue andando (no conoce las tablas ni escribe 'paquete'). El nuevo las
-- lee al abrir el cobro y la ficha de la clienta: sin ellas, falla.
--
-- Bloqueos: crear tablas no bloquea nada existente. Las FK nuevas hacia
-- `negocios`, `clientes`, `servicios` y `atencion_servicios` toman un candado
-- breve (SHARE ROW EXCLUSIVE) sobre esas tablas: no frena lecturas, y las
-- tablas nuevas están vacías, así que no revisa filas. El CHECK de
-- `atencion_pagos` se reemplaza como NOT VALID y se valida aparte: la
-- validación lee la tabla sin frenar escrituras. Si un candado no llega en 5
-- segundos, falla entera sin dejar nada a medias y se reintenta.
-- Respaldo: no hace falta uno aparte (no reescribe ni borra filas).
--
-- Para deshacerla (sólo si ningún pago usa 'paquete'):
--   DROP TABLE usos_de_paquete, paquetes_de_clientes, paquetes;
--   y volver el CHECK de atencion_pagos a los cinco medios.
BEGIN;

SET LOCAL lock_timeout = '5s';

-- CreateTable
CREATE TABLE "paquetes" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "sesiones" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "vigenciaMeses" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paquetes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paquetes_de_clientes" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "paqueteId" TEXT,
    "sesiones" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "valorPorSesionCents" INTEGER NOT NULL,
    "lineaDeVentaId" TEXT NOT NULL,
    "vendidoAt" TIMESTAMP(3) NOT NULL,
    "venceAt" TIMESTAMP(3),
    "devueltoAt" TIMESTAMP(3),
    "devueltoCents" INTEGER,
    "devueltoMedio" TEXT,
    "devueltoPorId" TEXT,
    "devueltoPorNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paquetes_de_clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usos_de_paquete" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "paqueteId" TEXT NOT NULL,
    "lineaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usos_de_paquete_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "paquetes_businessId_idx" ON "paquetes"("businessId");

-- CreateIndex
CREATE INDEX "paquetes_serviceId_idx" ON "paquetes"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "paquetes_de_clientes_lineaDeVentaId_key" ON "paquetes_de_clientes"("lineaDeVentaId");

-- CreateIndex
CREATE INDEX "paquetes_de_clientes_businessId_customerId_idx" ON "paquetes_de_clientes"("businessId", "customerId");

-- CreateIndex
CREATE INDEX "paquetes_de_clientes_serviceId_idx" ON "paquetes_de_clientes"("serviceId");

-- CreateIndex
CREATE INDEX "paquetes_de_clientes_paqueteId_idx" ON "paquetes_de_clientes"("paqueteId");

-- CreateIndex
CREATE UNIQUE INDEX "paquetes_de_clientes_id_businessId_key" ON "paquetes_de_clientes"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "usos_de_paquete_lineaId_key" ON "usos_de_paquete"("lineaId");

-- CreateIndex
CREATE INDEX "usos_de_paquete_paqueteId_idx" ON "usos_de_paquete"("paqueteId");

-- AddForeignKey
ALTER TABLE "paquetes" ADD CONSTRAINT "paquetes_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paquetes" ADD CONSTRAINT "paquetes_serviceId_businessId_fkey" FOREIGN KEY ("serviceId", "businessId") REFERENCES "servicios"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paquetes_de_clientes" ADD CONSTRAINT "paquetes_de_clientes_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paquetes_de_clientes" ADD CONSTRAINT "paquetes_de_clientes_customerId_businessId_fkey" FOREIGN KEY ("customerId", "businessId") REFERENCES "clientes"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paquetes_de_clientes" ADD CONSTRAINT "paquetes_de_clientes_serviceId_businessId_fkey" FOREIGN KEY ("serviceId", "businessId") REFERENCES "servicios"("id", "businessId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paquetes_de_clientes" ADD CONSTRAINT "paquetes_de_clientes_paqueteId_fkey" FOREIGN KEY ("paqueteId") REFERENCES "paquetes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paquetes_de_clientes" ADD CONSTRAINT "paquetes_de_clientes_lineaDeVentaId_fkey" FOREIGN KEY ("lineaDeVentaId") REFERENCES "atencion_servicios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usos_de_paquete" ADD CONSTRAINT "usos_de_paquete_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usos_de_paquete" ADD CONSTRAINT "usos_de_paquete_paqueteId_businessId_fkey" FOREIGN KEY ("paqueteId", "businessId") REFERENCES "paquetes_de_clientes"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usos_de_paquete" ADD CONSTRAINT "usos_de_paquete_lineaId_fkey" FOREIGN KEY ("lineaId") REFERENCES "atencion_servicios"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Reglas de forma (la aplicación las valida antes; acá son la segunda barrera).
ALTER TABLE "paquetes" ADD CONSTRAINT "paquetes_sesiones_check" CHECK ("sesiones" BETWEEN 2 AND 50);
ALTER TABLE "paquetes" ADD CONSTRAINT "paquetes_priceCents_check" CHECK ("priceCents" > 0 AND "priceCents" <= 2000000000);
ALTER TABLE "paquetes" ADD CONSTRAINT "paquetes_vigenciaMeses_check" CHECK ("vigenciaMeses" IS NULL OR "vigenciaMeses" BETWEEN 1 AND 36);

ALTER TABLE "paquetes_de_clientes" ADD CONSTRAINT "paquetes_de_clientes_sesiones_check" CHECK ("sesiones" BETWEEN 2 AND 50);
ALTER TABLE "paquetes_de_clientes" ADD CONSTRAINT "paquetes_de_clientes_montos_check"
  CHECK ("priceCents" > 0 AND "valorPorSesionCents" > 0 AND "valorPorSesionCents" * "sesiones" <= "priceCents");
-- La devolución: todo junto o nada, y nunca más de lo que costó.
ALTER TABLE "paquetes_de_clientes" ADD CONSTRAINT "paquetes_de_clientes_devolucion_check" CHECK (
  ("devueltoAt" IS NULL AND "devueltoCents" IS NULL AND "devueltoMedio" IS NULL AND "devueltoPorNombre" IS NULL)
  OR ("devueltoAt" IS NOT NULL AND "devueltoCents" IS NOT NULL AND "devueltoCents" BETWEEN 0 AND "priceCents"
      AND "devueltoMedio" IN ('efectivo', 'tarjeta-debito', 'tarjeta-credito', 'transferencia', 'billetera-digital')
      AND "devueltoPorNombre" IS NOT NULL)
);

-- El medio interno 'paquete' en los pagos de una atención.
ALTER TABLE "atencion_pagos" DROP CONSTRAINT "atencion_pagos_method_check";
ALTER TABLE "atencion_pagos" ADD CONSTRAINT "atencion_pagos_method_check"
  CHECK ("method" IN ('efectivo', 'tarjeta-debito', 'tarjeta-credito', 'transferencia', 'billetera-digital', 'paquete')) NOT VALID;

-- El rubro nuevo "Centro de estética" (`lib/rubros.ts`). Se queda NOT VALID,
-- como estaba: hay negocios de antes con rubros que el CHECK ya no lista.
ALTER TABLE "negocios" DROP CONSTRAINT "negocios_type_check";
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_type_check"
  CHECK ("type" IN ('salon', 'barberia', 'spa-de-unas', 'estetica', 'odontologia', 'salud', 'fitness', 'otro')) NOT VALID;

COMMIT;

-- Fuera de la transacción: valida el CHECK leyendo la tabla, sin frenar escrituras.
ALTER TABLE "atencion_pagos" VALIDATE CONSTRAINT "atencion_pagos_method_check";
