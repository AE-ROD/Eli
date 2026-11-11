-- Prótesis de la clínica dental: catálogo de laboratorios y de materiales con
-- su regla de reparto en tres partes (odontóloga tratante / clínica /
-- técnico), excepciones por odontólogo × material, la auditoría de esos
-- cambios, las prótesis del paciente con su seguimiento, y lo que va a usar
-- el cobro por abonos. Una sola migración para todo el módulo, escrita a mano
-- en el estilo de `etapa_6_odontologia`.
--
-- Aditiva y sin pérdida: tablas nuevas con sus índices, claves foráneas,
-- CHECKs y triggers; columnas nuevas nullable en `atencion_servicios` y
-- `prestaciones_del_plan` (sin default: Postgres no reescribe la tabla), y
-- los materiales iniciales de las clínicas dentales que ya existen (el único
-- INSERT, en una tabla nueva). No toca ni reescribe filas existentes, así
-- que el código viejo sigue funcionando con ella aplicada. Los salones,
-- barberías y spas de uñas no escriben nunca en las tablas nuevas: lo impide
-- `lib/permisos.ts`, que pregunta el rubro.
--
-- Lo que agrega:
--   laboratorios: catálogo de laboratorios externos (sin cuenta en Eli).
--   materiales_de_protesis: precio por arcada o por pieza y regla de reparto.
--   excepciones_de_reparto_de_protesis: regla de un odontólogo en un material.
--   cambios_de_reparto_de_protesis: auditoría de las reglas (§3.5).
--   protesis: el diseño, el valor y el reparto CONGELADO al crearla.
--   eventos_de_protesis: el seguimiento, sólo se agrega.
--   pagos_al_laboratorio: lo que se le pagó a un laboratorio (para la tanda
--     del cobro; hoy nadie escribe).
--   prestaciones_del_plan.protesisId: la prestación "Boca" que armó
--     "Agregar al plan y presupuesto".
--   atencion_servicios.protesisId, odontologoCents, clinicaCents,
--     tecnicoCents, pagoAlLaboratorioId: el abono (para la tanda del cobro;
--     hoy nadie escribe).
--
-- Queda para la tanda del cobro (no hay código que lo use todavía, pero el
-- modelo ya lo soporta, para no hacer otra migración):
--   - El abono se cobra en la Sala de espera como una línea de la atención
--     con `protesisId`, sin servicio ni producto y sin la comisión de la
--     cascada (`atencion_servicios_protesis_check`: `commissionAt` siempre
--     null). `congelarComisiones`, la vista previa de la liquidación, Mi
--     plata y el conteo de pendientes de Comisiones tienen que saltarse esas
--     líneas: si no, el CHECK rechaza el cobro.
--   - Al cobrar se congela el reparto del abono en `odontologoCents`,
--     `clinicaCents` y `tecnicoCents` con la regla de la prótesis
--     (`repartirMonto`, lib/protesis.ts): los tres juntos, suman el precio de
--     la línea y la dueña no lleva parte de odontóloga (CHECKs). Congelado no
--     cambia (trigger `atencion_servicios_reparto_de_protesis`).
--   - La parte de la odontóloga se libera para la liquidación cuando la
--     prótesis tiene `entregadaEn`; lo cobrado después entra en la siguiente.
--     Se marca con el `liquidacionId` de siempre (los triggers de la etapa 2
--     la protegen igual).
--   - La parte del técnico liberada y sin `pagoAlLaboratorioId` es "por
--     pagar al laboratorio"; "Marcar pagado" crea un `pagos_al_laboratorio`
--     y marca las líneas. Anular el pago las suelta.
--   - Anular una prótesis con abonos (cualquier línea con su `protesisId`) es
--     409: el endpoint de hoy ya lo revisa.
--
-- Todas las FK a otra fila del negocio desde las tablas nuevas son
-- compuestas contra (id, businessId), como en la etapa 6: Postgres rechaza
-- una fila que mezcle el paciente, el miembro, el material o el laboratorio
-- de otro negocio. Lo que cuelga del negocio, del paciente o de la prótesis
-- es CASCADE (también la excepción desde su miembro y su material, como
-- `porcentajes_comision`); lo que apunta a miembros, materiales y
-- laboratorios desde una prótesis o un pago es NO ACTION: ni Restrict
-- (rompería el borrado en cascada del negocio entero) ni SetNull (en una
-- compuesta anularía también businessId). `atencion_servicios` no tiene
-- `businessId`: sus dos FK nuevas son simples y el trigger
-- `atencion_servicios_reparto_de_protesis` exige que la prótesis y el pago
-- sean del negocio de la atención, como `atencion_servicios_mismo_negocio`.
--
-- Dinero en centavos INTEGER con tope 2.000.000.000, como el tablero y la
-- liquidación. Porcentajes en puntos base (10.000 = 100 %), que suman
-- exactamente 10.000.
--
-- Va entera en una transacción explícita: si algo falla a mitad, no queda
-- aplicada a medias. Se aplica con psql (`-v ON_ERROR_STOP=1`). Requiere
-- `20261106120000_etapa_6_odontologia` aplicada antes. Orden de despliegue:
-- README.md, sección "Migraciones en producción".
BEGIN;

-- ─── Columnas nuevas en tablas existentes ───────────────────────────────────
-- Nullable y sin default: Postgres no reescribe la tabla.

-- AlterTable
ALTER TABLE "atencion_servicios" ADD COLUMN     "clinicaCents" INTEGER,
ADD COLUMN     "odontologoCents" INTEGER,
ADD COLUMN     "pagoAlLaboratorioId" TEXT,
ADD COLUMN     "protesisId" TEXT,
ADD COLUMN     "tecnicoCents" INTEGER;

-- AlterTable
ALTER TABLE "prestaciones_del_plan" ADD COLUMN     "protesisId" TEXT;

-- ─── Tablas nuevas ──────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "laboratorios" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "contacto" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "laboratorios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materiales_de_protesis" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "unidad" TEXT NOT NULL,
    "tipos" TEXT[],
    "precioCents" INTEGER NOT NULL,
    "pbOdontologo" INTEGER NOT NULL,
    "pbClinica" INTEGER NOT NULL,
    "pbTecnico" INTEGER NOT NULL,
    "laboratorioPorDefectoId" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "materiales_de_protesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "excepciones_de_reparto_de_protesis" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "pbOdontologo" INTEGER NOT NULL,
    "pbClinica" INTEGER NOT NULL,
    "pbTecnico" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "excepciones_de_reparto_de_protesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cambios_de_reparto_de_protesis" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "materialNombre" TEXT NOT NULL,
    "memberId" TEXT,
    "memberName" TEXT,
    "anteriorPbOdontologo" INTEGER,
    "anteriorPbClinica" INTEGER,
    "anteriorPbTecnico" INTEGER,
    "nuevoPbOdontologo" INTEGER,
    "nuevoPbClinica" INTEGER,
    "nuevoPbTecnico" INTEGER,
    "changedById" TEXT NOT NULL,
    "changedByName" TEXT NOT NULL,
    "changedByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cambios_de_reparto_de_protesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "protesis" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "memberId" TEXT,
    "byOwner" BOOLEAN NOT NULL DEFAULT false,
    "tratanteNombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "arcada" TEXT NOT NULL,
    "piezas" INTEGER[],
    "pilares" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "zonas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "materialId" TEXT NOT NULL,
    "materialNombre" TEXT NOT NULL,
    "unidad" TEXT NOT NULL,
    "precioUnitarioCents" INTEGER NOT NULL,
    "unidades" INTEGER NOT NULL,
    "valorCents" INTEGER NOT NULL,
    "laboratorioId" TEXT,
    "laboratorioNombre" TEXT,
    "entregaEstimada" DATE,
    "estado" TEXT NOT NULL DEFAULT 'impresion',
    "pbOdontologo" INTEGER NOT NULL,
    "pbClinica" INTEGER NOT NULL,
    "pbTecnico" INTEGER NOT NULL,
    "origenDelReparto" TEXT NOT NULL,
    "entregadaEn" TIMESTAMP(3),
    "anuladaEn" TIMESTAMP(3),
    "anuladaPorNombre" TEXT,
    "creadoPorNombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "protesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_de_protesis" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "protesisId" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "autorNombre" TEXT NOT NULL,
    "autorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_de_protesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagos_al_laboratorio" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "laboratorioId" TEXT NOT NULL,
    "laboratorioNombre" TEXT NOT NULL,
    "montoCents" INTEGER NOT NULL,
    "medio" TEXT NOT NULL,
    "pagadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pagadoPorId" TEXT NOT NULL,
    "pagadoPorNombre" TEXT NOT NULL,
    "anuladoEn" TIMESTAMP(3),
    "anuladoPorNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_al_laboratorio_pkey" PRIMARY KEY ("id")
);

-- ─── Índices ────────────────────────────────────────────────────────────────
-- Los de tablas nuevas, sobre tablas vacías. Los tres de tablas existentes
-- (`atencion_servicios`, `prestaciones_del_plan`) son sobre columnas recién
-- agregadas, todas en null: se construyen rápido, pero bloquean las
-- escrituras de esa tabla mientras tanto (no son CONCURRENTLY).

-- CreateIndex
CREATE INDEX "laboratorios_businessId_idx" ON "laboratorios"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "laboratorios_id_businessId_key" ON "laboratorios"("id", "businessId");

-- CreateIndex
CREATE INDEX "materiales_de_protesis_businessId_idx" ON "materiales_de_protesis"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "materiales_de_protesis_id_businessId_key" ON "materiales_de_protesis"("id", "businessId");

-- CreateIndex
CREATE INDEX "excepciones_de_reparto_de_protesis_businessId_idx" ON "excepciones_de_reparto_de_protesis"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "excepciones_de_reparto_de_protesis_memberId_materialId_key" ON "excepciones_de_reparto_de_protesis"("memberId", "materialId");

-- CreateIndex
CREATE INDEX "cambios_de_reparto_de_protesis_businessId_createdAt_idx" ON "cambios_de_reparto_de_protesis"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "protesis_businessId_customerId_createdAt_idx" ON "protesis"("businessId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "protesis_businessId_estado_idx" ON "protesis"("businessId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "protesis_id_businessId_key" ON "protesis"("id", "businessId");

-- CreateIndex
CREATE INDEX "eventos_de_protesis_protesisId_createdAt_idx" ON "eventos_de_protesis"("protesisId", "createdAt");

-- CreateIndex
CREATE INDEX "pagos_al_laboratorio_businessId_laboratorioId_pagadoEn_idx" ON "pagos_al_laboratorio"("businessId", "laboratorioId", "pagadoEn");

-- CreateIndex
CREATE UNIQUE INDEX "pagos_al_laboratorio_id_businessId_key" ON "pagos_al_laboratorio"("id", "businessId");

-- CreateIndex
CREATE INDEX "atencion_servicios_protesisId_idx" ON "atencion_servicios"("protesisId");

-- CreateIndex
CREATE INDEX "atencion_servicios_pagoAlLaboratorioId_idx" ON "atencion_servicios"("pagoAlLaboratorioId");

-- CreateIndex
CREATE INDEX "prestaciones_del_plan_protesisId_idx" ON "prestaciones_del_plan"("protesisId");

-- ─── Claves foráneas ────────────────────────────────────────────────────────

-- AddForeignKey
-- Las tres sobre tablas existentes revisan sus filas (todas con la columna
-- nueva en null, así que no pueden fallar) y bloquean sus escrituras
-- mientras lo hacen: con el tamaño de hoy, un instante.
ALTER TABLE "atencion_servicios" ADD CONSTRAINT "atencion_servicios_protesisId_fkey" FOREIGN KEY ("protesisId") REFERENCES "protesis"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atencion_servicios" ADD CONSTRAINT "atencion_servicios_pagoAlLaboratorioId_fkey" FOREIGN KEY ("pagoAlLaboratorioId") REFERENCES "pagos_al_laboratorio"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestaciones_del_plan" ADD CONSTRAINT "prestaciones_del_plan_protesisId_businessId_fkey" FOREIGN KEY ("protesisId", "businessId") REFERENCES "protesis"("id", "businessId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laboratorios" ADD CONSTRAINT "laboratorios_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materiales_de_protesis" ADD CONSTRAINT "materiales_de_protesis_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materiales_de_protesis" ADD CONSTRAINT "materiales_de_protesis_laboratorioPorDefectoId_businessId_fkey" FOREIGN KEY ("laboratorioPorDefectoId", "businessId") REFERENCES "laboratorios"("id", "businessId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excepciones_de_reparto_de_protesis" ADD CONSTRAINT "excepciones_de_reparto_de_protesis_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excepciones_de_reparto_de_protesis" ADD CONSTRAINT "excepciones_de_reparto_de_protesis_memberId_businessId_fkey" FOREIGN KEY ("memberId", "businessId") REFERENCES "miembros_negocio"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excepciones_de_reparto_de_protesis" ADD CONSTRAINT "excepciones_de_reparto_de_protesis_materialId_businessId_fkey" FOREIGN KEY ("materialId", "businessId") REFERENCES "materiales_de_protesis"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cambios_de_reparto_de_protesis" ADD CONSTRAINT "cambios_de_reparto_de_protesis_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protesis" ADD CONSTRAINT "protesis_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protesis" ADD CONSTRAINT "protesis_customerId_businessId_fkey" FOREIGN KEY ("customerId", "businessId") REFERENCES "clientes"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protesis" ADD CONSTRAINT "protesis_memberId_businessId_fkey" FOREIGN KEY ("memberId", "businessId") REFERENCES "miembros_negocio"("id", "businessId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protesis" ADD CONSTRAINT "protesis_materialId_businessId_fkey" FOREIGN KEY ("materialId", "businessId") REFERENCES "materiales_de_protesis"("id", "businessId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protesis" ADD CONSTRAINT "protesis_laboratorioId_businessId_fkey" FOREIGN KEY ("laboratorioId", "businessId") REFERENCES "laboratorios"("id", "businessId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_de_protesis" ADD CONSTRAINT "eventos_de_protesis_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_de_protesis" ADD CONSTRAINT "eventos_de_protesis_protesisId_businessId_fkey" FOREIGN KEY ("protesisId", "businessId") REFERENCES "protesis"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_al_laboratorio" ADD CONSTRAINT "pagos_al_laboratorio_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_al_laboratorio" ADD CONSTRAINT "pagos_al_laboratorio_laboratorioId_businessId_fkey" FOREIGN KEY ("laboratorioId", "businessId") REFERENCES "laboratorios"("id", "businessId") ON DELETE NO ACTION ON UPDATE CASCADE;



-- ─── Índices únicos sobre una expresión, escritos a mano ────────────────────
-- Prisma no los representa. El nombre de un laboratorio o de un material no
-- se repite en la clínica sin distinguir mayúsculas: "Zirconio" y "zirconio"
-- chocan acá (P2002), no sólo en el endpoint.

CREATE UNIQUE INDEX "laboratorios_businessId_nombre_key" ON "laboratorios"("businessId", lower("nombre"));
CREATE UNIQUE INDEX "materiales_de_protesis_businessId_nombre_key" ON "materiales_de_protesis"("businessId", lower("nombre"));


-- ─── Restricciones CHECK, escritas a mano ───────────────────────────────────
-- Prisma no las representa en el esquema. Son la segunda barrera, porque no
-- hay RLS; repiten las reglas de `lib/protesis.ts` (si cambia una, cambia la
-- otra). Un CHECK que da NULL pasa: por eso los "todos o ninguno" piden
-- IS NOT NULL a cada columna en vez de confiar en la comparación.
--
-- Las de tablas nuevas no llevan NOT VALID: no hay filas viejas. Las de
-- `atencion_servicios` tampoco: sólo miran las columnas nuevas, que en las
-- filas que hay están en null y las cumplen. `prestaciones_del_plan` no suma
-- ninguna: la prestación que crea "Agregar al plan" nace de "Boca", pero el
-- plan la sigue editando como cualquier otra.
--
-- Piezas: FDI permanente (la prótesis no se hace sobre temporales). Superior
-- = cuadrantes 1 y 2; inferior = 3 y 4.

-- laboratorios
ALTER TABLE "laboratorios" ADD CONSTRAINT "laboratorios_nombre_check" CHECK ("nombre" = btrim("nombre") AND length("nombre") BETWEEN 1 AND 80);
ALTER TABLE "laboratorios" ADD CONSTRAINT "laboratorios_contacto_check" CHECK ("contacto" IS NULL OR ("contacto" = btrim("contacto") AND length("contacto") BETWEEN 1 AND 200));

-- materiales_de_protesis: la unidad y sus tipos van juntos (por arcada:
-- removible y total; por pieza: fija, implante y corona), y la regla suma
-- exactamente 10.000 puntos base.
ALTER TABLE "materiales_de_protesis" ADD CONSTRAINT "materiales_de_protesis_nombre_check" CHECK ("nombre" = btrim("nombre") AND length("nombre") BETWEEN 1 AND 80);
ALTER TABLE "materiales_de_protesis" ADD CONSTRAINT "materiales_de_protesis_unidad_check" CHECK ("unidad" IN ('arcada', 'pieza'));
ALTER TABLE "materiales_de_protesis" ADD CONSTRAINT "materiales_de_protesis_tipos_check"
CHECK ("tipos" IS NOT NULL AND cardinality("tipos") >= 1
   AND (("unidad" = 'arcada' AND "tipos" <@ ARRAY['removible', 'total']::TEXT[])
     OR ("unidad" = 'pieza' AND "tipos" <@ ARRAY['fija', 'implante', 'corona']::TEXT[])));
ALTER TABLE "materiales_de_protesis" ADD CONSTRAINT "materiales_de_protesis_precioCents_check" CHECK ("precioCents" >= 0 AND "precioCents" <= 2000000000);
ALTER TABLE "materiales_de_protesis" ADD CONSTRAINT "materiales_de_protesis_reparto_check"
CHECK ("pbOdontologo" BETWEEN 0 AND 10000 AND "pbClinica" BETWEEN 0 AND 10000 AND "pbTecnico" BETWEEN 0 AND 10000
   AND "pbOdontologo" + "pbClinica" + "pbTecnico" = 10000);
ALTER TABLE "materiales_de_protesis" ADD CONSTRAINT "materiales_de_protesis_orden_check" CHECK ("orden" >= 0 AND "orden" <= 999);

-- excepciones_de_reparto_de_protesis
ALTER TABLE "excepciones_de_reparto_de_protesis" ADD CONSTRAINT "excepciones_de_reparto_de_protesis_reparto_check"
CHECK ("pbOdontologo" BETWEEN 0 AND 10000 AND "pbClinica" BETWEEN 0 AND 10000 AND "pbTecnico" BETWEEN 0 AND 10000
   AND "pbOdontologo" + "pbClinica" + "pbTecnico" = 10000);

-- cambios_de_reparto_de_protesis: el antes y el después, cada uno entero o
-- ninguno, y si está, que sume 10.000. Una excepción nombra al odontólogo;
-- una regla de material nunca se "quita" (no se borra).
ALTER TABLE "cambios_de_reparto_de_protesis" ADD CONSTRAINT "cambios_de_reparto_de_protesis_scope_check" CHECK ("scope" IN ('material', 'excepcion'));
ALTER TABLE "cambios_de_reparto_de_protesis" ADD CONSTRAINT "cambios_de_reparto_de_protesis_miembro_check"
CHECK (("scope" = 'excepcion') = ("memberName" IS NOT NULL) AND ("memberId" IS NULL OR "scope" = 'excepcion'));
ALTER TABLE "cambios_de_reparto_de_protesis" ADD CONSTRAINT "cambios_de_reparto_de_protesis_anterior_check"
CHECK (("anteriorPbOdontologo" IS NULL AND "anteriorPbClinica" IS NULL AND "anteriorPbTecnico" IS NULL)
    OR ("anteriorPbOdontologo" IS NOT NULL AND "anteriorPbClinica" IS NOT NULL AND "anteriorPbTecnico" IS NOT NULL
        AND "anteriorPbOdontologo" BETWEEN 0 AND 10000 AND "anteriorPbClinica" BETWEEN 0 AND 10000 AND "anteriorPbTecnico" BETWEEN 0 AND 10000
        AND "anteriorPbOdontologo" + "anteriorPbClinica" + "anteriorPbTecnico" = 10000));
ALTER TABLE "cambios_de_reparto_de_protesis" ADD CONSTRAINT "cambios_de_reparto_de_protesis_nuevo_check"
CHECK (("nuevoPbOdontologo" IS NULL AND "nuevoPbClinica" IS NULL AND "nuevoPbTecnico" IS NULL AND "scope" = 'excepcion')
    OR ("nuevoPbOdontologo" IS NOT NULL AND "nuevoPbClinica" IS NOT NULL AND "nuevoPbTecnico" IS NOT NULL
        AND "nuevoPbOdontologo" BETWEEN 0 AND 10000 AND "nuevoPbClinica" BETWEEN 0 AND 10000 AND "nuevoPbTecnico" BETWEEN 0 AND 10000
        AND "nuevoPbOdontologo" + "nuevoPbClinica" + "nuevoPbTecnico" = 10000));
ALTER TABLE "cambios_de_reparto_de_protesis" ADD CONSTRAINT "cambios_de_reparto_de_protesis_algo_cambia_check"
CHECK ("anteriorPbOdontologo" IS NOT NULL OR "nuevoPbOdontologo" IS NOT NULL);
ALTER TABLE "cambios_de_reparto_de_protesis" ADD CONSTRAINT "cambios_de_reparto_de_protesis_nombres_check"
CHECK (length(btrim("materialNombre")) > 0 AND length(btrim("changedByName")) > 0);

-- protesis: el tipo, la arcada y lo que se puede marcar en ella.
ALTER TABLE "protesis" ADD CONSTRAINT "protesis_tipo_check" CHECK ("tipo" IN ('removible', 'total', 'fija', 'implante', 'corona'));
ALTER TABLE "protesis" ADD CONSTRAINT "protesis_arcada_check" CHECK ("arcada" IN ('superior', 'inferior', 'ambas'));
-- Piezas y pilares: nunca NULL (Prisma crea las listas sin NOT NULL), FDI
-- permanente, de la arcada elegida, y una pieza no es a la vez protésica y
-- pilar. Que no se repitan dentro de una lista lo valida la app.
ALTER TABLE "protesis" ADD CONSTRAINT "protesis_piezas_check"
CHECK ("piezas" IS NOT NULL AND "pilares" IS NOT NULL
   AND cardinality("piezas") BETWEEN 1 AND 32 AND cardinality("pilares") <= 32
   AND ("piezas" || "pilares") <@ ARRAY[11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28,
                                        31, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48]::INTEGER[]
   AND NOT ("piezas" && "pilares"));
ALTER TABLE "protesis" ADD CONSTRAINT "protesis_piezas_de_la_arcada_check"
CHECK (("arcada" <> 'superior' OR ("piezas" || "pilares") <@ ARRAY[11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28]::INTEGER[])
   AND ("arcada" <> 'inferior' OR ("piezas" || "pilares") <@ ARRAY[31, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48]::INTEGER[])
   AND ("arcada" <> 'ambas' OR ("piezas" && ARRAY[11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28]::INTEGER[]
                            AND "piezas" && ARRAY[31, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48]::INTEGER[])));
-- La total reemplaza la arcada entera (todas sus piezas, sin pilares); la
-- corona es una sola pieza, sin pilares.
ALTER TABLE "protesis" ADD CONSTRAINT "protesis_total_check"
CHECK ("tipo" <> 'total' OR (cardinality("pilares") = 0
   AND ("arcada" = 'inferior' OR "piezas" @> ARRAY[11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28]::INTEGER[])
   AND ("arcada" = 'superior' OR "piezas" @> ARRAY[31, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48]::INTEGER[])));
ALTER TABLE "protesis" ADD CONSTRAINT "protesis_corona_check"
CHECK ("tipo" <> 'corona' OR (cardinality("piezas") = 1 AND cardinality("pilares") = 0 AND "arcada" <> 'ambas'));
-- Zonas de la base: sólo removible y total; el paladar sólo arriba y la
-- barra lingual sólo abajo.
ALTER TABLE "protesis" ADD CONSTRAINT "protesis_zonas_check"
CHECK ("zonas" IS NOT NULL AND cardinality("zonas") <= 5
   AND "zonas" <@ ARRAY['paladar', 'lingual', 'flanco', 'rebasado', 'reparacion']::TEXT[]
   AND ("tipo" IN ('removible', 'total') OR cardinality("zonas") = 0)
   AND (NOT ('paladar' = ANY ("zonas")) OR "arcada" <> 'inferior')
   AND (NOT ('lingual' = ANY ("zonas")) OR "arcada" <> 'superior'));
-- El material: su unidad corresponde al tipo, y el valor es precio por
-- unidades (arcadas, o piezas más pilares), sin pasar del tope.
ALTER TABLE "protesis" ADD CONSTRAINT "protesis_unidad_check"
CHECK (("unidad" = 'arcada' AND "tipo" IN ('removible', 'total')) OR ("unidad" = 'pieza' AND "tipo" IN ('fija', 'implante', 'corona')));
ALTER TABLE "protesis" ADD CONSTRAINT "protesis_unidades_check"
CHECK (("unidad" <> 'arcada' OR "unidades" = (CASE WHEN "arcada" = 'ambas' THEN 2 ELSE 1 END))
   AND ("unidad" <> 'pieza' OR "unidades" = cardinality("piezas") + cardinality("pilares")));
ALTER TABLE "protesis" ADD CONSTRAINT "protesis_valor_check"
CHECK ("precioUnitarioCents" >= 0 AND "precioUnitarioCents" <= 2000000000
   AND "valorCents" >= 0 AND "valorCents" <= 2000000000
   AND "valorCents"::BIGINT = "precioUnitarioCents"::BIGINT * "unidades");
-- El reparto congelado.
ALTER TABLE "protesis" ADD CONSTRAINT "protesis_reparto_check"
CHECK ("pbOdontologo" BETWEEN 0 AND 10000 AND "pbClinica" BETWEEN 0 AND 10000 AND "pbTecnico" BETWEEN 0 AND 10000
   AND "pbOdontologo" + "pbClinica" + "pbTecnico" = 10000
   AND "origenDelReparto" IN ('material', 'excepcion'));
-- La dueña no es miembro: si es la tratante, sin `memberId` (y su regla es la
-- del material: las excepciones son de miembros). Sin `byOwner` y sin
-- `memberId` es alguien que dejó el equipo.
ALTER TABLE "protesis" ADD CONSTRAINT "protesis_tratante_check"
CHECK ((NOT "byOwner" OR ("memberId" IS NULL AND "origenDelReparto" = 'material')) AND length(btrim("tratanteNombre")) > 0);
-- El estado y sus fechas van juntos, como en liquidaciones.
ALTER TABLE "protesis" ADD CONSTRAINT "protesis_estado_check"
CHECK ("estado" IN ('impresion', 'en-laboratorio', 'prueba', 'ajustes', 'entregada', 'anulada'));
ALTER TABLE "protesis" ADD CONSTRAINT "protesis_entregada_check" CHECK (("estado" = 'entregada') = ("entregadaEn" IS NOT NULL));
ALTER TABLE "protesis" ADD CONSTRAINT "protesis_anulada_check"
CHECK (("estado" = 'anulada') = ("anuladaEn" IS NOT NULL) AND ("anuladaEn" IS NULL) = ("anuladaPorNombre" IS NULL));
-- El laboratorio y su nombre copiado, juntos o ninguno.
ALTER TABLE "protesis" ADD CONSTRAINT "protesis_laboratorio_check"
CHECK (("laboratorioId" IS NULL) = ("laboratorioNombre" IS NULL));
ALTER TABLE "protesis" ADD CONSTRAINT "protesis_nombres_check"
CHECK (length(btrim("materialNombre")) > 0 AND length(btrim("creadoPorNombre")) > 0);
ALTER TABLE "protesis" ADD CONSTRAINT "protesis_entregaEstimada_check" CHECK ("entregaEstimada" IS NULL OR "entregaEstimada" >= DATE '2000-01-01');

-- eventos_de_protesis
ALTER TABLE "eventos_de_protesis" ADD CONSTRAINT "eventos_de_protesis_estado_check"
CHECK ("estado" IN ('impresion', 'en-laboratorio', 'prueba', 'ajustes', 'entregada', 'anulada'));
ALTER TABLE "eventos_de_protesis" ADD CONSTRAINT "eventos_de_protesis_autorNombre_check" CHECK (length(btrim("autorNombre")) > 0);

-- pagos_al_laboratorio: medios de `lib/medios-de-pago.ts`, como
-- `atencion_pagos_method_check`.
ALTER TABLE "pagos_al_laboratorio" ADD CONSTRAINT "pagos_al_laboratorio_montoCents_check" CHECK ("montoCents" > 0 AND "montoCents" <= 2000000000);
ALTER TABLE "pagos_al_laboratorio" ADD CONSTRAINT "pagos_al_laboratorio_medio_check"
CHECK ("medio" IN ('efectivo', 'tarjeta-debito', 'tarjeta-credito', 'transferencia', 'billetera-digital'));
ALTER TABLE "pagos_al_laboratorio" ADD CONSTRAINT "pagos_al_laboratorio_anulado_check" CHECK (("anuladoEn" IS NULL) = ("anuladoPorNombre" IS NULL));
ALTER TABLE "pagos_al_laboratorio" ADD CONSTRAINT "pagos_al_laboratorio_nombres_check"
CHECK (length(btrim("laboratorioNombre")) > 0 AND length(btrim("pagadoPorNombre")) > 0);

-- atencion_servicios: el abono de una prótesis no es un servicio ni un
-- producto del catálogo y no lleva la comisión de la cascada (la parte de la
-- odontóloga sale del reparto: pagarle las dos sería pagarle dos veces).
ALTER TABLE "atencion_servicios" ADD CONSTRAINT "atencion_servicios_protesis_check"
CHECK ("protesisId" IS NULL OR ("tipo" = 'servicio' AND "serviceId" IS NULL AND "productId" IS NULL AND "commissionAt" IS NULL));
-- El reparto del abono: los tres juntos o ninguno, sólo en un abono, y suman
-- lo abonado.
ALTER TABLE "atencion_servicios" ADD CONSTRAINT "atencion_servicios_reparto_check"
CHECK (("odontologoCents" IS NULL AND "clinicaCents" IS NULL AND "tecnicoCents" IS NULL)
    OR ("protesisId" IS NOT NULL AND "odontologoCents" IS NOT NULL AND "clinicaCents" IS NOT NULL AND "tecnicoCents" IS NOT NULL
        AND "odontologoCents" >= 0 AND "clinicaCents" >= 0 AND "tecnicoCents" >= 0
        AND "odontologoCents" + "clinicaCents" + "tecnicoCents" = "priceCents"));
-- La dueña no se paga a sí misma: su parte va a la clínica.
ALTER TABLE "atencion_servicios" ADD CONSTRAINT "atencion_servicios_duena_sin_reparto_check"
CHECK (NOT ("byOwner" AND COALESCE("odontologoCents", 0) > 0));
-- Sólo se paga al laboratorio una línea con parte de técnico congelada.
ALTER TABLE "atencion_servicios" ADD CONSTRAINT "atencion_servicios_pago_al_laboratorio_check"
CHECK ("pagoAlLaboratorioId" IS NULL OR "tecnicoCents" IS NOT NULL);


-- ─── Triggers ───────────────────────────────────────────────────────────────
-- Mismo estilo que los de la etapa 6: tablas calificadas con "public" y
-- `search_path` fijo. Ninguna es SECURITY DEFINER.

-- protesis_congelada: lo que se copió al crear la prótesis (diseño, material,
-- precio, valor, reparto, tratante, paciente, quién la creó) no cambia. Sólo
-- se mueven el estado (hacia adelante: Impresión → En laboratorio → Prueba en
-- boca → Ajustes → Entregada, saltando pasos si hace falta, o a Anulada), el
-- laboratorio, la entrega estimada y las fechas de entrega y anulación; y
-- `memberId` sólo pasa a null (desvincular a la tratante, para poder borrar
-- después al miembro: su nombre queda copiado). Una entregada o anulada ya
-- no cambia nada de eso. Se compara la fila entera menos esas columnas, así
-- que una columna que se agregue en el futuro también queda fija.
CREATE FUNCTION "public"."protesis_congelada"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  movibles TEXT[] := ARRAY['estado', 'laboratorioId', 'laboratorioNombre', 'entregaEstimada', 'entregadaEn',
                           'anuladaEn', 'anuladaPorNombre', 'memberId', 'updatedAt'];
  paso_viejo INTEGER;
  paso_nuevo INTEGER;
BEGIN
  IF (to_jsonb(NEW) - movibles) IS DISTINCT FROM (to_jsonb(OLD) - movibles) THEN
    RAISE EXCEPTION 'protesis %: el diseño, el material, el valor y el reparto no cambian; se anula y se crea otra', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."memberId" IS NOT NULL AND NEW."memberId" IS DISTINCT FROM OLD."memberId" THEN
    RAISE EXCEPTION 'protesis %: la tratante no cambia', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD."estado" IN ('entregada', 'anulada') AND (
       NEW."estado" IS DISTINCT FROM OLD."estado"
    OR NEW."laboratorioId" IS DISTINCT FROM OLD."laboratorioId"
    OR NEW."laboratorioNombre" IS DISTINCT FROM OLD."laboratorioNombre"
    OR NEW."entregaEstimada" IS DISTINCT FROM OLD."entregaEstimada"
    OR NEW."entregadaEn" IS DISTINCT FROM OLD."entregadaEn"
    OR NEW."anuladaEn" IS DISTINCT FROM OLD."anuladaEn"
    OR NEW."anuladaPorNombre" IS DISTINCT FROM OLD."anuladaPorNombre"
  ) THEN
    RAISE EXCEPTION 'protesis %: una prótesis entregada o anulada ya no cambia', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."estado" IS DISTINCT FROM OLD."estado" AND NEW."estado" <> 'anulada' THEN
    paso_viejo := array_position(ARRAY['impresion', 'en-laboratorio', 'prueba', 'ajustes', 'entregada']::TEXT[], OLD."estado");
    paso_nuevo := array_position(ARRAY['impresion', 'en-laboratorio', 'prueba', 'ajustes', 'entregada']::TEXT[], NEW."estado");
    IF paso_nuevo IS NULL OR paso_viejo IS NULL OR paso_nuevo <= paso_viejo THEN
      RAISE EXCEPTION 'protesis %: el seguimiento sólo avanza', OLD."id"
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER protesis_congelada
BEFORE UPDATE ON "public"."protesis"
FOR EACH ROW EXECUTE FUNCTION "public"."protesis_congelada"();

-- protesis_no_se_borra: una prótesis se anula, no se borra. Pasa sólo dentro
-- de la cascada de borrar su paciente o su negocio entero (cuando la cascada
-- llega a la prótesis, el paciente o el negocio ya no existe), como
-- `evoluciones_no_se_borran`.
CREATE FUNCTION "public"."protesis_no_se_borra"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "public"."clientes" WHERE "id" = OLD."customerId")
     AND EXISTS (SELECT 1 FROM "public"."negocios" WHERE "id" = OLD."businessId") THEN
    RAISE EXCEPTION 'protesis %: una prótesis no se borra; se anula', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER protesis_no_se_borra
BEFORE DELETE ON "public"."protesis"
FOR EACH ROW EXECUTE FUNCTION "public"."protesis_no_se_borra"();

-- eventos_de_protesis_inmutables: el seguimiento es un registro. Un evento no
-- se edita nunca, y se borra sólo con su prótesis (la cascada llega cuando la
-- prótesis ya no existe).
CREATE FUNCTION "public"."eventos_de_protesis_inmutables"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'eventos_de_protesis %: un paso del seguimiento no se edita', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM "public"."protesis" WHERE "id" = OLD."protesisId") THEN
    RAISE EXCEPTION 'eventos_de_protesis %: un paso del seguimiento no se borra', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER eventos_de_protesis_inmutables
BEFORE UPDATE OR DELETE ON "public"."eventos_de_protesis"
FOR EACH ROW EXECUTE FUNCTION "public"."eventos_de_protesis_inmutables"();

-- atencion_servicios_reparto_de_protesis: la línea no tiene `businessId`, así
-- que sus FK a `protesis` y `pagos_al_laboratorio` no pueden ser compuestas;
-- este trigger exige que las dos sean del negocio de su atención, como
-- `atencion_servicios_mismo_negocio` con el miembro, el producto y la
-- liquidación (que no se toca: éste es aparte). Además, un reparto ya
-- congelado no cambia (ni la prótesis ni el monto de la línea), y una línea
-- pagada al laboratorio no pasa a otro pago (sí se suelta, al anularlo).
-- Si la atención ya no existe es la cascada de borrar el negocio: pasa.
CREATE FUNCTION "public"."atencion_servicios_reparto_de_protesis"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  negocio TEXT;
BEGIN
  -- En INSERT no se lee OLD: el IF de afuera separa los dos casos.
  IF TG_OP = 'UPDATE' THEN
    IF OLD."odontologoCents" IS NOT NULL AND (
         NEW."protesisId" IS DISTINCT FROM OLD."protesisId"
      OR NEW."priceCents" IS DISTINCT FROM OLD."priceCents"
      OR NEW."odontologoCents" IS DISTINCT FROM OLD."odontologoCents"
      OR NEW."clinicaCents" IS DISTINCT FROM OLD."clinicaCents"
      OR NEW."tecnicoCents" IS DISTINCT FROM OLD."tecnicoCents"
    ) AND EXISTS (SELECT 1 FROM "public"."atenciones" WHERE "id" = OLD."visitId") THEN
      RAISE EXCEPTION 'atencion_servicios %: el reparto del abono ya está congelado', OLD."id"
        USING ERRCODE = 'check_violation';
    END IF;

    IF OLD."pagoAlLaboratorioId" IS NOT NULL AND NEW."pagoAlLaboratorioId" IS NOT NULL
       AND NEW."pagoAlLaboratorioId" <> OLD."pagoAlLaboratorioId"
       AND EXISTS (SELECT 1 FROM "public"."atenciones" WHERE "id" = OLD."visitId") THEN
      RAISE EXCEPTION 'atencion_servicios %: la línea ya está en otro pago al laboratorio', OLD."id"
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW."visitId" = OLD."visitId"
       AND NEW."protesisId" IS NOT DISTINCT FROM OLD."protesisId"
       AND NEW."pagoAlLaboratorioId" IS NOT DISTINCT FROM OLD."pagoAlLaboratorioId" THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW."protesisId" IS NULL AND NEW."pagoAlLaboratorioId" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "businessId" INTO negocio FROM "public"."atenciones" WHERE "id" = NEW."visitId";

  -- En un UPDATE sin atención estamos dentro de una cascada (borrar el
  -- negocio). En un INSERT no pasa: la FK a `atenciones` ya lo rechaza.
  IF negocio IS NULL AND TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NEW."protesisId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "public"."protesis" WHERE "id" = NEW."protesisId" AND "businessId" = negocio
  ) THEN
    RAISE EXCEPTION 'atencion_servicios %: la prótesis es de otro negocio', NEW."id"
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW."pagoAlLaboratorioId" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "public"."pagos_al_laboratorio" WHERE "id" = NEW."pagoAlLaboratorioId" AND "businessId" = negocio
  ) THEN
    RAISE EXCEPTION 'atencion_servicios %: el pago al laboratorio es de otro negocio', NEW."id"
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER atencion_servicios_reparto_de_protesis
BEFORE INSERT OR UPDATE ON "public"."atencion_servicios"
FOR EACH ROW EXECUTE FUNCTION "public"."atencion_servicios_reparto_de_protesis"();


-- ─── Materiales iniciales de las clínicas que ya existen ────────────────────
-- Los cinco del diseño, con sus precios y su reparto (odontóloga / clínica /
-- técnico), como `MATERIALES_INICIALES` (lib/protesis.ts), que es lo que
-- reciben las clínicas que se registran desde ahora. Sólo a las clínicas
-- dentales SIN ningún material: como los materiales no se borran (se
-- desactivan), una clínica sin ninguno es una que nunca los recibió. Por eso
-- es idempotente: correrlo de nuevo no duplica nada ni repone lo que una
-- clínica cambió. Sin laboratorio por defecto (todavía no hay laboratorios).
INSERT INTO "materiales_de_protesis"
  ("id", "businessId", "nombre", "unidad", "tipos", "precioCents", "pbOdontologo", "pbClinica", "pbTecnico", "orden", "activo", "createdAt", "updatedAt")
SELECT gen_random_uuid()::TEXT, n."id", m."nombre", m."unidad", m."tipos", m."precioCents", m."pbOdontologo", m."pbClinica", m."pbTecnico", m."orden",
       true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "negocios" n
CROSS JOIN (VALUES
  ('Acrílico termocurado', 'arcada', ARRAY['removible', 'total']::TEXT[], 18000000, 4000, 3000, 3000, 1),
  ('Flexible (nylon)', 'arcada', ARRAY['removible']::TEXT[], 32000000, 3500, 2500, 4000, 2),
  ('Cromo-cobalto', 'arcada', ARRAY['removible']::TEXT[], 45000000, 3500, 2500, 4000, 3),
  ('Metal-porcelana', 'pieza', ARRAY['fija', 'implante', 'corona']::TEXT[], 22000000, 4000, 2000, 4000, 4),
  ('Zirconio', 'pieza', ARRAY['fija', 'implante', 'corona']::TEXT[], 29000000, 3500, 2000, 4500, 5)
) AS m("nombre", "unidad", "tipos", "precioCents", "pbOdontologo", "pbClinica", "pbTecnico", "orden")
WHERE n."type" = 'odontologia'
  AND NOT EXISTS (SELECT 1 FROM "materiales_de_protesis" x WHERE x."businessId" = n."id");

COMMIT;
