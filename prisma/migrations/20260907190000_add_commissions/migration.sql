-- AlterTable
ALTER TABLE "citas" ADD COLUMN     "commissionAmount" DECIMAL(12,2),
ADD COLUMN     "commissionAt" TIMESTAMP(3),
ADD COLUMN     "commissionPercent" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "miembros_negocio" ADD COLUMN     "commissionPercent" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "porcentajes_comision" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "porcentajes_comision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cambios_comision" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "memberId" TEXT,
    "memberName" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "serviceId" TEXT,
    "serviceName" TEXT,
    "changedById" TEXT,
    "changedByName" TEXT NOT NULL,
    "changedByEmail" TEXT NOT NULL,
    "previousPercent" DOUBLE PRECISION,
    "newPercent" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cambios_comision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "porcentajes_comision_businessId_idx" ON "porcentajes_comision"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "porcentajes_comision_memberId_serviceId_key" ON "porcentajes_comision"("memberId", "serviceId");

-- CreateIndex
CREATE INDEX "cambios_comision_businessId_memberId_createdAt_idx" ON "cambios_comision"("businessId", "memberId", "createdAt");

-- CreateIndex
CREATE INDEX "citas_businessId_memberId_startTime_idx" ON "citas"("businessId", "memberId", "startTime");

-- CreateIndex
-- Habilita la FK compuesta de porcentajes_comision(memberId, businessId): sin
-- esto Postgres no puede referenciar el par, y es lo único que impide que una
-- fila de comisión tenga el profesional de un negocio con el businessId de otro.
CREATE UNIQUE INDEX "miembros_negocio_id_businessId_key" ON "miembros_negocio"("id", "businessId");

-- CreateIndex
-- Idem, para el lado del servicio.
CREATE UNIQUE INDEX "servicios_id_businessId_key" ON "servicios"("id", "businessId");

-- AddForeignKey
ALTER TABLE "porcentajes_comision" ADD CONSTRAINT "porcentajes_comision_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- FK compuesta contra (id, businessId), no contra id solo: evita filas con el
-- businessId de un negocio y el memberId de otro. Cascade: una excepción sin
-- su profesional no tiene sentido.
ALTER TABLE "porcentajes_comision" ADD CONSTRAINT "porcentajes_comision_memberId_businessId_fkey" FOREIGN KEY ("memberId", "businessId") REFERENCES "miembros_negocio"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- FK compuesta igual que la anterior. Restrict, no Cascade: borrar un
-- servicio con comisiones configuradas debe fallar, no arrastrarlas en
-- silencio (puedeGestionarServicios incluye al encargado; puedeEditarComisiones
-- es sólo del dueño -- con Cascade, el encargado borraría comisiones sin pasar
-- por ese permiso). Ver comentario del modelo en schema.prisma.
ALTER TABLE "porcentajes_comision" ADD CONSTRAINT "porcentajes_comision_serviceId_businessId_fkey" FOREIGN KEY ("serviceId", "businessId") REFERENCES "servicios"("id", "businessId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cambios_comision" ADD CONSTRAINT "cambios_comision_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- FK simple (no compuesta) + SetNull: una tabla de auditoría no puede
-- cascadear con lo que audita. Dar de baja a un profesional no puede borrar
-- su historial de comisiones -- es justo cuando más se necesita. `memberName`
-- guarda el snapshot para que la fila siga siendo legible. No es FK compuesta
-- porque SetNull anularía TODAS las columnas de la constraint a la vez,
-- incluida businessId, que acá es NOT NULL.
ALTER TABLE "cambios_comision" ADD CONSTRAINT "cambios_comision_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "miembros_negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
-- SetNull + `scope`/`serviceName` explícitos (ver modelo): borrar el servicio
-- no puede cambiar el significado de un registro ya escrito.
ALTER TABLE "cambios_comision" ADD CONSTRAINT "cambios_comision_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "servicios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
-- SetNull + `changedByName`/`changedByEmail` de snapshot: borrar al usuario
-- que hizo el cambio no puede borrar el registro de que lo hizo.
ALTER TABLE "cambios_comision" ADD CONSTRAINT "cambios_comision_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CheckConstraint
-- Defensa en profundidad: el rango 0-100 también se valida en la app (Zod, en
-- la futura interfaz de configuración, todavía sin ficha creada), pero es
-- dinero de terceros -- vale la pena que la base lo garantice igual si algún
-- día un insert la esquiva. `NULL` sigue significando "sin configurar", no
-- viola el check. Viven sólo acá, no en schema.prisma (Prisma no soporta
-- `@@check` en la versión de este proyecto): si alguien corre `migrate dev`
-- después de tocar estos campos, revisar que no las borre por "drift".
ALTER TABLE "miembros_negocio" ADD CONSTRAINT "miembros_negocio_commissionPercent_check" CHECK ("commissionPercent" IS NULL OR ("commissionPercent" >= 0 AND "commissionPercent" <= 100));

ALTER TABLE "porcentajes_comision" ADD CONSTRAINT "porcentajes_comision_percent_check" CHECK ("percent" >= 0 AND "percent" <= 100);

ALTER TABLE "citas" ADD CONSTRAINT "citas_commissionPercent_check" CHECK ("commissionPercent" IS NULL OR ("commissionPercent" >= 0 AND "commissionPercent" <= 100));

ALTER TABLE "cambios_comision" ADD CONSTRAINT "cambios_comision_previousPercent_check" CHECK ("previousPercent" IS NULL OR ("previousPercent" >= 0 AND "previousPercent" <= 100));

ALTER TABLE "cambios_comision" ADD CONSTRAINT "cambios_comision_newPercent_check" CHECK ("newPercent" IS NULL OR ("newPercent" >= 0 AND "newPercent" <= 100));

-- CheckConstraint
-- `scope` es un enum de dos valores modelado como texto (Prisma no tiene enum
-- de esquema separado acá): el CHECK es la única barrera real contra un
-- tercer valor colado por fuera de la app.
ALTER TABLE "cambios_comision" ADD CONSTRAINT "cambios_comision_scope_check" CHECK ("scope" IN ('default', 'service'));

-- CheckConstraint
-- La comisión congelada de una cita (commissionPercent, commissionAmount,
-- commissionAt) es todo-o-nada: los tres NULL ("sin resolver todavía") o los
-- tres NOT NULL ("ya calculada y congelada"). Sin este CHECK nada impide un
-- commissionAmount = 0 con commissionPercent NULL, que una liquidación futura
-- leería como "comisión cero" en vez de "pendiente de configurar" -- exactamente
-- lo que el producto prohíbe (docs/PRODUCTO.md §3, regla "sin configurar no es
-- cero").
ALTER TABLE "citas" ADD CONSTRAINT "citas_comision_congelada_check"
CHECK (("commissionPercent" IS NULL AND "commissionAmount" IS NULL AND "commissionAt" IS NULL)
    OR ("commissionPercent" IS NOT NULL AND "commissionAmount" IS NOT NULL AND "commissionAt" IS NOT NULL));
