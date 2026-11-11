-- Odontología: el cuarto rubro, el único que cambia la interfaz (sillones,
-- ficha clínica, odontograma, evoluciones y plan de tratamiento). Una sola
-- migración para todo el rubro, escrita a mano.
--
-- Aditiva y sin pérdida: dos columnas con default en citas y una en
-- servicios, una columna nullable en citas, tablas nuevas con sus índices y
-- claves foráneas, CHECKs, dos únicos parciales y dos triggers. No toca ni
-- reescribe filas existentes, así que el código viejo sigue funcionando con
-- ella aplicada. Los salones, barberías y spas de uñas no escriben nunca en
-- las tablas nuevas: lo impide `lib/permisos.ts`, que pregunta el rubro.
--
-- Lo que agrega:
--   negocios: el CHECK del rubro suma 'odontologia' (reemplaza al de
--     `cierre_de_la_v1`, que tiene que estar aplicada antes). Sigue NOT VALID.
--   servicios: `esUrgencia` (la reserva pública sólo ofrece horas de hoy).
--   citas: `primeraVez` (la reserva sumó 15 minutos) y `sillonId`.
--   sillones, fichas_clinicas, odontograma_marcas, evoluciones,
--   planes_de_tratamiento, etapas_del_plan, prestaciones_del_plan: tablas
--     nuevas.
--
-- Todas las FK a otra fila del negocio son compuestas contra
-- (id, businessId), como las de la etapa 2: Postgres rechaza una fila que
-- mezcle el paciente, la cita, el sillón, el servicio o el odontólogo de otro
-- negocio. Las que cuelgan del paciente o del plan son CASCADE; las que
-- apuntan a citas, sillones, servicios y miembros son NO ACTION: ni Restrict
-- (rompería el borrado en cascada del negocio entero, que puede llegar a la
-- fila apuntada antes que a la que apunta) ni SetNull (en una compuesta
-- anularía también businessId). Borrar una cita, un servicio o un miembro
-- que algo dental referencia falla (P2003): el endpoint primero desvincula o
-- responde 409.
--
-- Dinero en centavos INTEGER con tope 2.000.000.000, como el tablero y la
-- liquidación (`prestaciones_del_plan.valorCents`).
--
-- Va entera en una transacción explícita: si algo falla a mitad, no queda
-- aplicada a medias. Se aplica con psql (`-v ON_ERROR_STOP=1`). Orden de
-- despliegue: README.md, sección "Migraciones en producción".
BEGIN;

-- ─── Columnas nuevas ────────────────────────────────────────────────────────
-- Con default constante: Postgres no reescribe la tabla.

-- AlterTable
ALTER TABLE "servicios" ADD COLUMN     "esUrgencia" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "citas" ADD COLUMN     "primeraVez" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sillonId" TEXT;

-- ─── Tablas nuevas ──────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "sillones" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sillones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fichas_clinicas" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fechaNacimiento" DATE,
    "prevision" TEXT,
    "alergias" TEXT,
    "antecedentes" TEXT,
    "odontogramaActualizadoEn" TIMESTAMP(3),
    "odontogramaActualizadoPor" TEXT,
    "actualizadaPor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fichas_clinicas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "odontograma_marcas" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "pieza" INTEGER NOT NULL,
    "cara" TEXT,
    "tipo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "odontograma_marcas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evoluciones" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "autorNombre" TEXT NOT NULL,
    "autorUserId" TEXT,
    "memberId" TEXT,
    "appointmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evoluciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planes_de_tratamiento" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "vigente" BOOLEAN NOT NULL DEFAULT true,
    "creadoPorNombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planes_de_tratamiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etapas_del_plan" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'por-aprobar',
    "presentadaEn" TIMESTAMP(3),
    "aprobadaEn" TIMESTAMP(3),
    "aprobadaPorNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "etapas_del_plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prestaciones_del_plan" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "etapaId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "pieza" INTEGER,
    "caras" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "serviceId" TEXT,
    "nombre" TEXT NOT NULL,
    "memberId" TEXT,
    "profesionalNombre" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'por-agendar',
    "valorCents" INTEGER NOT NULL,
    "appointmentId" TEXT,
    "realizadaEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prestaciones_del_plan_pkey" PRIMARY KEY ("id")
);

-- ─── Índices ────────────────────────────────────────────────────────────────
-- Todos sobre tablas nuevas y vacías: no bloquean nada que ya exista.

-- CreateIndex
CREATE UNIQUE INDEX "sillones_id_businessId_key" ON "sillones"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "sillones_businessId_nombre_key" ON "sillones"("businessId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "fichas_clinicas_customerId_businessId_key" ON "fichas_clinicas"("customerId", "businessId");

-- CreateIndex
CREATE INDEX "odontograma_marcas_businessId_customerId_idx" ON "odontograma_marcas"("businessId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "odontograma_marcas_customerId_pieza_cara_key" ON "odontograma_marcas"("customerId", "pieza", "cara");

-- CreateIndex
CREATE INDEX "evoluciones_businessId_customerId_createdAt_idx" ON "evoluciones"("businessId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "evoluciones_appointmentId_idx" ON "evoluciones"("appointmentId");

-- CreateIndex
CREATE INDEX "planes_de_tratamiento_businessId_customerId_idx" ON "planes_de_tratamiento"("businessId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "planes_de_tratamiento_id_businessId_key" ON "planes_de_tratamiento"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "planes_de_tratamiento_customerId_version_key" ON "planes_de_tratamiento"("customerId", "version");

-- CreateIndex
CREATE INDEX "etapas_del_plan_planId_orden_idx" ON "etapas_del_plan"("planId", "orden");

-- CreateIndex
CREATE INDEX "etapas_del_plan_businessId_estado_idx" ON "etapas_del_plan"("businessId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "etapas_del_plan_id_businessId_key" ON "etapas_del_plan"("id", "businessId");

-- CreateIndex
CREATE INDEX "prestaciones_del_plan_etapaId_orden_idx" ON "prestaciones_del_plan"("etapaId", "orden");

-- CreateIndex
CREATE INDEX "prestaciones_del_plan_appointmentId_idx" ON "prestaciones_del_plan"("appointmentId");

-- ─── Claves foráneas ────────────────────────────────────────────────────────

-- AddForeignKey
-- La única sobre una tabla existente: revisa las citas que hay (todas con
-- sillonId en null, así que no puede fallar) y bloquea las escrituras en
-- citas mientras lo hace, que con el tamaño de hoy es un instante.
ALTER TABLE "citas" ADD CONSTRAINT "citas_sillonId_businessId_fkey" FOREIGN KEY ("sillonId", "businessId") REFERENCES "sillones"("id", "businessId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sillones" ADD CONSTRAINT "sillones_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fichas_clinicas" ADD CONSTRAINT "fichas_clinicas_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fichas_clinicas" ADD CONSTRAINT "fichas_clinicas_customerId_businessId_fkey" FOREIGN KEY ("customerId", "businessId") REFERENCES "clientes"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "odontograma_marcas" ADD CONSTRAINT "odontograma_marcas_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "odontograma_marcas" ADD CONSTRAINT "odontograma_marcas_customerId_businessId_fkey" FOREIGN KEY ("customerId", "businessId") REFERENCES "clientes"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evoluciones" ADD CONSTRAINT "evoluciones_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evoluciones" ADD CONSTRAINT "evoluciones_customerId_businessId_fkey" FOREIGN KEY ("customerId", "businessId") REFERENCES "clientes"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evoluciones" ADD CONSTRAINT "evoluciones_memberId_businessId_fkey" FOREIGN KEY ("memberId", "businessId") REFERENCES "miembros_negocio"("id", "businessId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evoluciones" ADD CONSTRAINT "evoluciones_appointmentId_businessId_fkey" FOREIGN KEY ("appointmentId", "businessId") REFERENCES "citas"("id", "businessId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planes_de_tratamiento" ADD CONSTRAINT "planes_de_tratamiento_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planes_de_tratamiento" ADD CONSTRAINT "planes_de_tratamiento_customerId_businessId_fkey" FOREIGN KEY ("customerId", "businessId") REFERENCES "clientes"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etapas_del_plan" ADD CONSTRAINT "etapas_del_plan_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etapas_del_plan" ADD CONSTRAINT "etapas_del_plan_planId_businessId_fkey" FOREIGN KEY ("planId", "businessId") REFERENCES "planes_de_tratamiento"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestaciones_del_plan" ADD CONSTRAINT "prestaciones_del_plan_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestaciones_del_plan" ADD CONSTRAINT "prestaciones_del_plan_etapaId_businessId_fkey" FOREIGN KEY ("etapaId", "businessId") REFERENCES "etapas_del_plan"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestaciones_del_plan" ADD CONSTRAINT "prestaciones_del_plan_serviceId_businessId_fkey" FOREIGN KEY ("serviceId", "businessId") REFERENCES "servicios"("id", "businessId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestaciones_del_plan" ADD CONSTRAINT "prestaciones_del_plan_memberId_businessId_fkey" FOREIGN KEY ("memberId", "businessId") REFERENCES "miembros_negocio"("id", "businessId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestaciones_del_plan" ADD CONSTRAINT "prestaciones_del_plan_appointmentId_businessId_fkey" FOREIGN KEY ("appointmentId", "businessId") REFERENCES "citas"("id", "businessId") ON DELETE NO ACTION ON UPDATE CASCADE;



-- ─── Restricciones CHECK, escritas a mano ───────────────────────────────────
-- Prisma no las representa en el esquema (ver la migración del tablero). Son
-- la segunda barrera, porque no hay RLS. Si alguien corre `migrate dev`,
-- revisar que no las borre por "drift". Las de tablas nuevas no llevan
-- NOT VALID: no hay filas viejas que revisar.

-- negocios: el rubro suma 'odontologia' (`RUBROS`, lib/rubros.ts). Mismo
-- estilo que en `cierre_de_la_v1`: NOT VALID, así que no revisa las filas que
-- ya están; la lista nueva contiene a la vieja, de modo que ninguna fila que
-- cumplía la anterior deja de cumplir esta.
ALTER TABLE "negocios" DROP CONSTRAINT "negocios_type_check";
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_type_check" CHECK ("type" IN ('salon', 'barberia', 'spa-de-unas', 'odontologia', 'salud', 'fitness', 'otro')) NOT VALID;

-- sillones: el nombre se guarda ya recortado (así el único por negocio no
-- deja pasar "Sillón 1 " junto a "Sillón 1"), y el orden de la agenda.
ALTER TABLE "sillones" ADD CONSTRAINT "sillones_nombre_check" CHECK ("nombre" = btrim("nombre") AND length("nombre") > 0);
ALTER TABLE "sillones" ADD CONSTRAINT "sillones_orden_check" CHECK ("orden" >= 0 AND "orden" <= 999);

-- fichas_clinicas: previsión de la lista cerrada; fecha de nacimiento con
-- sentido; quién y cuándo del odontograma, juntos o ninguno.
ALTER TABLE "fichas_clinicas" ADD CONSTRAINT "fichas_clinicas_prevision_check" CHECK ("prevision" IS NULL OR "prevision" IN ('fonasa', 'isapre', 'particular', 'otra'));
ALTER TABLE "fichas_clinicas" ADD CONSTRAINT "fichas_clinicas_fechaNacimiento_check" CHECK ("fechaNacimiento" IS NULL OR "fechaNacimiento" >= DATE '1900-01-01');
ALTER TABLE "fichas_clinicas" ADD CONSTRAINT "fichas_clinicas_odontograma_check" CHECK (("odontogramaActualizadoEn" IS NULL) = ("odontogramaActualizadoPor" IS NULL));
ALTER TABLE "fichas_clinicas" ADD CONSTRAINT "fichas_clinicas_actualizadaPor_check" CHECK (length(btrim("actualizadaPor")) > 0);

-- odontograma_marcas: las mismas reglas que `errorDeMarca`
-- (lib/odontograma.ts). Notación FDI: el primer dígito es el cuadrante (1-4
-- permanente, 5-8 temporal; 1, 2, 5 y 6 son el maxilar) y el segundo la
-- posición desde la línea media (1-8 permanente, 1-5 temporal; 1-3 incisivos
-- y canino, el resto premolares y molares). En INTEGER, `/` es la división
-- entera y `%` el resto.
ALTER TABLE "odontograma_marcas" ADD CONSTRAINT "odontograma_marcas_pieza_check"
CHECK ("pieza" BETWEEN 11 AND 18 OR "pieza" BETWEEN 21 AND 28 OR "pieza" BETWEEN 31 AND 38 OR "pieza" BETWEEN 41 AND 48
    OR "pieza" BETWEEN 51 AND 55 OR "pieza" BETWEEN 61 AND 65 OR "pieza" BETWEEN 71 AND 75 OR "pieza" BETWEEN 81 AND 85);
ALTER TABLE "odontograma_marcas" ADD CONSTRAINT "odontograma_marcas_tipo_check"
CHECK ("tipo" IN ('caries', 'obturacion', 'sellante', 'corona', 'endodoncia', 'ausente', 'extraccion'));
ALTER TABLE "odontograma_marcas" ADD CONSTRAINT "odontograma_marcas_cara_check"
CHECK ("cara" IS NULL OR "cara" IN ('V', 'P', 'L', 'M', 'D', 'O', 'I'));
-- Caries, obturación y sellante van en una cara; corona, endodoncia, ausente
-- y extracción indicada son de la pieza entera, sin cara.
ALTER TABLE "odontograma_marcas" ADD CONSTRAINT "odontograma_marcas_tipo_y_cara_check"
CHECK (("tipo" IN ('caries', 'obturacion', 'sellante')) = ("cara" IS NOT NULL));
-- Palatina sólo en el maxilar, lingual sólo en la mandíbula, incisal sólo en
-- incisivos y caninos, oclusal sólo en premolares y molares.
ALTER TABLE "odontograma_marcas" ADD CONSTRAINT "odontograma_marcas_cara_de_la_pieza_check"
CHECK (("cara" IS DISTINCT FROM 'P' OR "pieza" / 10 IN (1, 2, 5, 6))
   AND ("cara" IS DISTINCT FROM 'L' OR "pieza" / 10 IN (3, 4, 7, 8))
   AND ("cara" IS DISTINCT FROM 'I' OR "pieza" % 10 BETWEEN 1 AND 3)
   AND ("cara" IS DISTINCT FROM 'O' OR "pieza" % 10 BETWEEN 4 AND 8));

-- evoluciones: nada vacío.
ALTER TABLE "evoluciones" ADD CONSTRAINT "evoluciones_texto_check" CHECK (length(btrim("texto")) > 0);
ALTER TABLE "evoluciones" ADD CONSTRAINT "evoluciones_autorNombre_check" CHECK (length(btrim("autorNombre")) > 0);

-- planes_de_tratamiento
ALTER TABLE "planes_de_tratamiento" ADD CONSTRAINT "planes_de_tratamiento_version_check" CHECK ("version" >= 1);
ALTER TABLE "planes_de_tratamiento" ADD CONSTRAINT "planes_de_tratamiento_creadoPorNombre_check" CHECK (length(btrim("creadoPorNombre")) > 0);

-- etapas_del_plan: el estado y su fecha van juntos, como en liquidaciones: no
-- hay "aprobada" sin cuándo ni quién, ni al revés.
ALTER TABLE "etapas_del_plan" ADD CONSTRAINT "etapas_del_plan_estado_check" CHECK ("estado" IN ('por-aprobar', 'aprobada'));
ALTER TABLE "etapas_del_plan" ADD CONSTRAINT "etapas_del_plan_orden_check" CHECK ("orden" >= 1);
ALTER TABLE "etapas_del_plan" ADD CONSTRAINT "etapas_del_plan_nombre_check" CHECK (length(btrim("nombre")) > 0);
ALTER TABLE "etapas_del_plan" ADD CONSTRAINT "etapas_del_plan_aprobada_check"
CHECK (("estado" = 'aprobada') = ("aprobadaEn" IS NOT NULL) AND ("aprobadaEn" IS NULL) = ("aprobadaPorNombre" IS NULL));

-- prestaciones_del_plan
ALTER TABLE "prestaciones_del_plan" ADD CONSTRAINT "prestaciones_del_plan_estado_check" CHECK ("estado" IN ('por-agendar', 'agendada', 'realizada'));
ALTER TABLE "prestaciones_del_plan" ADD CONSTRAINT "prestaciones_del_plan_orden_check" CHECK ("orden" >= 1);
ALTER TABLE "prestaciones_del_plan" ADD CONSTRAINT "prestaciones_del_plan_nombre_check" CHECK (length(btrim("nombre")) > 0);
ALTER TABLE "prestaciones_del_plan" ADD CONSTRAINT "prestaciones_del_plan_valorCents_check" CHECK ("valorCents" >= 0 AND "valorCents" <= 2000000000);
-- La pieza, FDI como en odontograma_marcas; null es "Boca".
ALTER TABLE "prestaciones_del_plan" ADD CONSTRAINT "prestaciones_del_plan_pieza_check"
CHECK ("pieza" IS NULL
    OR "pieza" BETWEEN 11 AND 18 OR "pieza" BETWEEN 21 AND 28 OR "pieza" BETWEEN 31 AND 38 OR "pieza" BETWEEN 41 AND 48
    OR "pieza" BETWEEN 51 AND 55 OR "pieza" BETWEEN 61 AND 65 OR "pieza" BETWEEN 71 AND 75 OR "pieza" BETWEEN 81 AND 85);
-- Las caras: nunca NULL (Prisma crea las listas sin NOT NULL), letras de la
-- lista, a lo más cinco, sólo con pieza, y válidas para esa pieza como en
-- odontograma_marcas. Que no se repitan lo valida la app (`sonCarasValidas`).
ALTER TABLE "prestaciones_del_plan" ADD CONSTRAINT "prestaciones_del_plan_caras_check"
CHECK ("caras" IS NOT NULL AND cardinality("caras") <= 5 AND "caras" <@ ARRAY['V', 'P', 'L', 'M', 'D', 'O', 'I']::TEXT[]);
ALTER TABLE "prestaciones_del_plan" ADD CONSTRAINT "prestaciones_del_plan_caras_con_pieza_check"
CHECK ("pieza" IS NOT NULL OR cardinality("caras") = 0);
ALTER TABLE "prestaciones_del_plan" ADD CONSTRAINT "prestaciones_del_plan_caras_de_la_pieza_check"
CHECK ((NOT ('P' = ANY ("caras")) OR "pieza" / 10 IN (1, 2, 5, 6))
   AND (NOT ('L' = ANY ("caras")) OR "pieza" / 10 IN (3, 4, 7, 8))
   AND (NOT ('I' = ANY ("caras")) OR "pieza" % 10 BETWEEN 1 AND 3)
   AND (NOT ('O' = ANY ("caras")) OR "pieza" % 10 BETWEEN 4 AND 8));
-- El estado y la cita van juntos: "por-agendar" no tiene cita y "agendada"
-- sí; "realizada" puede tenerla o no (se hizo fuera de una cita del panel).
-- Al cancelar o borrar la cita, la prestación vuelve a "por-agendar".
ALTER TABLE "prestaciones_del_plan" ADD CONSTRAINT "prestaciones_del_plan_cita_check"
CHECK (("estado" <> 'por-agendar' OR "appointmentId" IS NULL) AND ("estado" <> 'agendada' OR "appointmentId" IS NOT NULL));
ALTER TABLE "prestaciones_del_plan" ADD CONSTRAINT "prestaciones_del_plan_realizada_check" CHECK (("estado" = 'realizada') = ("realizadaEn" IS NOT NULL));


-- ─── Índices únicos parciales, escritos a mano ──────────────────────────────
-- Prisma no los representa.

-- Una pieza no lleva dos veces la misma marca de pieza (dos "corona" en la
-- 21). Las de cara ya las cubre el único (customerId, pieza, cara): con cara
-- null no chocan, así que ese único es justo "una marca por cara".
CREATE UNIQUE INDEX "odontograma_marcas_marca_de_pieza_key" ON "odontograma_marcas"("customerId", "pieza", "tipo") WHERE "cara" IS NULL;

-- Un solo plan vigente por paciente: dos "rehacer el plan" a la vez chocan
-- acá (el segundo es 409), igual que el número de versión.
CREATE UNIQUE INDEX "planes_de_tratamiento_vigente_key" ON "planes_de_tratamiento"("customerId") WHERE "vigente";


-- ─── Triggers: una evolución no se edita ni se borra ────────────────────────
-- Las evoluciones son el registro clínico: se agregan y quedan. El UPDATE se
-- rechaza siempre, salvo desvincular la cita o el miembro (ponerlos en null):
-- con FK NO ACTION, es lo que permite borrar después esa cita o ese miembro
-- sin perder la evolución. Se compara la fila entera menos esas dos columnas,
-- así que una columna que se agregue en el futuro también queda fija.
--
-- El DELETE directo también se rechaza. Pasa sólo dentro de una cascada:
-- borrar el paciente o el negocio entero (cuando la cascada llega a la
-- evolución, el paciente o el negocio ya no existe), igual que la excepción
-- de `atencion_servicios_liquidada_no_se_borra`.
--
-- Mismo estilo que `cita_servicios_mismo_negocio` (etapa 5): tablas
-- calificadas con "public" y `search_path` fijo. Ninguna es SECURITY DEFINER.
CREATE FUNCTION "public"."evoluciones_inmutables"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (to_jsonb(NEW) - 'memberId' - 'appointmentId') IS DISTINCT FROM (to_jsonb(OLD) - 'memberId' - 'appointmentId')
     OR (NEW."memberId" IS NOT NULL AND NEW."memberId" IS DISTINCT FROM OLD."memberId")
     OR (NEW."appointmentId" IS NOT NULL AND NEW."appointmentId" IS DISTINCT FROM OLD."appointmentId") THEN
    RAISE EXCEPTION 'evoluciones %: una evolución no se edita; se anota una nueva', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER evoluciones_inmutables
BEFORE UPDATE ON "public"."evoluciones"
FOR EACH ROW EXECUTE FUNCTION "public"."evoluciones_inmutables"();

CREATE FUNCTION "public"."evoluciones_no_se_borran"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "public"."clientes" WHERE "id" = OLD."customerId")
     AND EXISTS (SELECT 1 FROM "public"."negocios" WHERE "id" = OLD."businessId") THEN
    RAISE EXCEPTION 'evoluciones %: una evolución no se borra', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER evoluciones_no_se_borran
BEFORE DELETE ON "public"."evoluciones"
FOR EACH ROW EXECUTE FUNCTION "public"."evoluciones_no_se_borran"();

COMMIT;
