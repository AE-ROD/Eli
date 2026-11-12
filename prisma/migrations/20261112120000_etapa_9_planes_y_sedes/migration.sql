-- Planes y sedes (etapa 9): dos planes, Independiente (sólo atiende la dueña;
-- hasta 5 sedes, cada una con su horario por día; no puede invitar) y Equipo
-- (puede invitar; una sola sede, que es la dirección del negocio y no tiene
-- fila). Una sola migración para todo el paquete, escrita a mano en el estilo
-- de `etapa_6_odontologia`.
--
-- Aditiva, con una sola excepción: el relleno de `negocios.plan` (un UPDATE
-- sobre los negocios sin integrantes ni invitaciones pendientes). Ninguna otra
-- fila se toca ni se reescribe: las columnas nuevas de horarios, citas y lista
-- de espera quedan en NULL, y la tabla de sedes nace vacía.
--
-- Lo que agrega:
--   negocios: `plan` ("independiente" | "equipo", default "equipo", CHECK).
--     El relleno: un negocio con algún integrante en `miembros_negocio` o una
--     invitación pendiente (`acceptedAt` null) queda en "equipo"; el resto
--     pasa a "independiente".
--   sedes: tabla nueva (nombre, dirección, comuna, teléfono, orden, activo),
--     con CHECKs de texto, nombre único por negocio y el único (id,
--     businessId) que habilita las FK compuestas.
--   horarios_laborales, citas, lista_de_espera: `sedeId` nullable, con índice
--     y FK compuesta (sedeId, businessId) contra `sedes`, como la del sillón
--     de las citas (etapa 6): Postgres rechaza una fila con la sede de otro
--     negocio. CASCADE en horarios y lista de espera; NO ACTION en citas (una
--     sede con citas no se borra: se desactiva; NO ACTION y no Restrict, para
--     no romper el borrado en cascada del negocio entero). Desactivar una
--     sede con citas futuras activas lo bloquea la aplicación, no la base.
--   horarios_laborales_sede_horas_check: la franja de una sede exige "HH:MM"
--     válido y inicio < fin. No toca las franjas sin sede.
--   Cuatro triggers, todos con `SET search_path = public` y sin SECURITY
--   DEFINER, y todos con el mismo candado por negocio
--   (`pg_advisory_xact_lock(hashtext('plan-y-sedes:' || businessId))`, la
--   convención de la aplicación) para que dos transacciones a la vez no pasen
--   cada una por su lado la regla que se contradice con la de la otra:
--     invitaciones_exigen_plan_equipo (BEFORE INSERT en invitaciones): sólo un
--       negocio "equipo" crea invitaciones.
--     negocios_cambio_de_plan (BEFORE UPDATE OF plan en negocios): a
--       "independiente" sólo sin integrantes ni invitaciones pendientes; a
--       "equipo" sólo sin sedes activas.
--     sedes_reglas (BEFORE INSERT OR UPDATE en sedes): una sede que queda
--       activa (nueva o reactivada) exige plan "independiente" y no más de 5
--       activas en el negocio; al reactivar una sede se revalidan los
--       solapes de sus franjas (las reescribe con `active = active`, y las
--       revisa el trigger de abajo, así la regla vive en un solo lugar).
--     horarios_sedes_sin_pisarse (BEFORE INSERT OR UPDATE en
--       horarios_laborales): una franja activa con sede no se pisa, el mismo
--       día, con una franja activa de OTRA sede activa del mismo negocio.
--       Tocarse (fin = inicio) no es pisarse. Las franjas sin sede quedan
--       fuera.
--
-- Compatibilidad. El código viejo sigue andando con la migración aplicada: no
-- escribe las columnas nuevas (quedan en NULL), un negocio nuevo nace "equipo"
-- por el default, y los triggers salen enseguida cuando no hay sede de por
-- medio. Una excepción visible: un negocio que el relleno dejó en
-- "independiente" ya no puede crear invitaciones (el trigger las rechaza, y el
-- código viejo responde 500) hasta que pase a "equipo". El código nuevo NO anda
-- sin ella (lee y escribe `plan` y `sedeId`): se aplica ANTES de desplegar.
--
-- Requiere las migraciones anteriores del historial (usa `lista_de_espera`,
-- de la etapa 3, e `invitaciones`); si falta alguna tabla, falla entera sin
-- dejar nada a medias. Sin `btree_gist` ni `EXCLUDE`: serían una dependencia
-- nueva, y los solapes entre sedes se revisan con el trigger.
--
-- Bloqueos. Los de un `ALTER TABLE` duran hasta el COMMIT: `negocios`,
-- `horarios_laborales`, `citas` y `lista_de_espera` quedan sin escrituras un
-- instante (tablas chicas, ADD COLUMN sin default no reescribe, y las FK y el
-- CHECK sólo recorren filas con `sedeId` en NULL). Antes del relleno se bloquean
-- las escrituras de `miembros_negocio` e `invitaciones` (ver abajo). Con
-- `SET LOCAL lock_timeout = '5s'`: si un candado no llega en 5 segundos, falla
-- entera y se reintenta en otro momento.
--
-- Prisma no representa los CHECK ni los triggers: si alguien corre
-- `migrate dev`, revisar que no los borre por "drift".
--
-- Va entera en una transacción explícita. Se aplica con psql
-- (`-v ON_ERROR_STOP=1`). Orden de despliegue: README.md, sección
-- "Migraciones en producción".
BEGIN;

-- Si algo tuviera que esperar un candado más de 5 segundos, falla entera (sin
-- dejar nada a medias) en vez de dejar las escrituras del local en fila detrás
-- de ella. Se reintenta en otro momento.
SET LOCAL lock_timeout = '5s';

-- ─── negocios.plan ──────────────────────────────────────────────────────────

-- AlterTable
-- Con default constante: Postgres no reescribe la tabla.
ALTER TABLE "negocios" ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'equipo';

-- El relleno. Entre leer los integrantes y las invitaciones y confirmar, nadie
-- debe crear una invitación ni un integrante: si alguien lo hiciera, un negocio
-- quedaría "independiente" con una invitación pendiente. Mientras dura la
-- transacción esas dos tablas no reciben escrituras (SHARE ROW EXCLUSIVE es lo
-- que tomaría de todos modos `CREATE TRIGGER` más abajo). Los triggers todavía
-- no existen, así que este UPDATE no pasa por ellos. No toca `updatedAt`: no
-- es un cambio que hizo el negocio.
LOCK TABLE "miembros_negocio", "invitaciones" IN SHARE ROW EXCLUSIVE MODE;

UPDATE "negocios" n
SET "plan" = 'independiente'
WHERE NOT EXISTS (SELECT 1 FROM "miembros_negocio" m WHERE m."businessId" = n."id")
  AND NOT EXISTS (SELECT 1 FROM "invitaciones" i WHERE i."businessId" = n."id" AND i."acceptedAt" IS NULL);

-- Los ids de `PLANES` (lib/planes.ts). Un plan nuevo es una migración nueva
-- que reemplaza este CHECK. Va después del relleno: ya cumple.
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_plan_check" CHECK ("plan" IN ('independiente', 'equipo'));

-- ─── sedes ──────────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "sedes" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "comuna" TEXT NOT NULL,
    "telefono" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sedes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sedes_id_businessId_key" ON "sedes"("id", "businessId");

-- CreateIndex
CREATE UNIQUE INDEX "sedes_businessId_nombre_key" ON "sedes"("businessId", "nombre");

-- AddForeignKey
ALTER TABLE "sedes" ADD CONSTRAINT "sedes_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Los textos se guardan ya recortados (así el único por negocio no deja pasar
-- "Centro " junto a "Centro") y con un largo razonable; el teléfono, en
-- E.164 como `negocios.whatsapp`; el orden de la lista, como el de los
-- sillones. Sin NOT VALID: la tabla es nueva y no hay filas viejas.
ALTER TABLE "sedes" ADD CONSTRAINT "sedes_texto_check"
CHECK ("nombre" = btrim("nombre") AND length("nombre") BETWEEN 1 AND 40
   AND "direccion" = btrim("direccion") AND length("direccion") BETWEEN 1 AND 200
   AND "comuna" = btrim("comuna") AND length("comuna") BETWEEN 1 AND 80
   AND ("telefono" IS NULL OR "telefono" ~ '^\+[0-9]{8,15}$')
   AND "orden" BETWEEN 0 AND 999);

-- ─── sedeId en horarios, citas y lista de espera ────────────────────────────

-- AlterTable
ALTER TABLE "horarios_laborales" ADD COLUMN     "sedeId" TEXT;

-- AlterTable
ALTER TABLE "citas" ADD COLUMN     "sedeId" TEXT;

-- AlterTable
ALTER TABLE "lista_de_espera" ADD COLUMN     "sedeId" TEXT;

-- CreateIndex
CREATE INDEX "horarios_laborales_businessId_sedeId_idx" ON "horarios_laborales"("businessId", "sedeId");

-- CreateIndex
CREATE INDEX "citas_sedeId_idx" ON "citas"("sedeId");

-- CreateIndex
CREATE INDEX "lista_de_espera_sedeId_idx" ON "lista_de_espera"("sedeId");

-- AddForeignKey
-- Las tres revisan las filas que hay (todas con sedeId en null, así que no
-- pueden fallar) y bloquean las escrituras de su tabla mientras lo hacen, que
-- con el tamaño de hoy es un instante.
ALTER TABLE "horarios_laborales" ADD CONSTRAINT "horarios_laborales_sedeId_businessId_fkey" FOREIGN KEY ("sedeId", "businessId") REFERENCES "sedes"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lista_de_espera" ADD CONSTRAINT "lista_de_espera_sedeId_businessId_fkey" FOREIGN KEY ("sedeId", "businessId") REFERENCES "sedes"("id", "businessId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- NO ACTION: una sede con citas no se borra (se desactiva).
ALTER TABLE "citas" ADD CONSTRAINT "citas_sedeId_businessId_fkey" FOREIGN KEY ("sedeId", "businessId") REFERENCES "sedes"("id", "businessId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- La franja de una sede: "HH:MM" válido y empieza antes de terminar. Las
-- franjas sin sede (todas las de hoy) no entran: el horario general conserva
-- sus reglas de siempre. Sin NOT VALID: las filas que hay cumplen (sedeId es
-- null), y revisarlas es recorrer una tabla chica.
ALTER TABLE "horarios_laborales" ADD CONSTRAINT "horarios_laborales_sede_horas_check"
CHECK ("sedeId" IS NULL OR (
       "startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   AND "endTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
   AND "startTime" < "endTime"));

-- ─── Triggers ───────────────────────────────────────────────────────────────
-- Mismo estilo que `evoluciones_inmutables` (etapa 6): tablas calificadas con
-- "public" y `search_path` fijo. Ninguna es SECURITY DEFINER. Los cuatro toman
-- el mismo candado por negocio, y lo toman antes de leer lo que deciden: con
-- READ COMMITTED, quien lo recibe después ve lo que la otra transacción ya
-- confirmó. Así, "crear una invitación" y "pasar a independiente" (o "crear una
-- sede" y "pasar a equipo") no pueden confirmarse los dos a la vez.

-- invitaciones_exigen_plan_equipo: sólo el plan Equipo invita. Si el negocio no
-- existe (plan null), la FK de la invitación es quien lo rechaza.
CREATE FUNCTION "public"."invitaciones_exigen_plan_equipo"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  plan_del_negocio TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('plan-y-sedes:' || NEW."businessId"));

  SELECT "plan" INTO plan_del_negocio FROM "public"."negocios" WHERE "id" = NEW."businessId";

  IF plan_del_negocio IS NOT NULL AND plan_del_negocio <> 'equipo' THEN
    RAISE EXCEPTION 'invitaciones %: sólo el plan Equipo invita', NEW."id"
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER invitaciones_exigen_plan_equipo
BEFORE INSERT ON "public"."invitaciones"
FOR EACH ROW EXECUTE FUNCTION "public"."invitaciones_exigen_plan_equipo"();

-- negocios_cambio_de_plan: el cambio de plan no deja el negocio incoherente. A
-- "independiente" sólo si nadie más atiende (ni integrantes ni invitaciones
-- pendientes); a "equipo" sólo si no queda ninguna sede activa (el equipo tiene
-- una sola sede, la dirección del negocio). Sólo mira cuando el plan cambia de
-- verdad: una escritura que repite el plan pasa sin tomar el candado.
CREATE FUNCTION "public"."negocios_cambio_de_plan"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW."plan" IS NOT DISTINCT FROM OLD."plan" THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('plan-y-sedes:' || NEW."id"));

  IF NEW."plan" = 'independiente' AND (
       EXISTS (SELECT 1 FROM "public"."miembros_negocio" WHERE "businessId" = NEW."id")
    OR EXISTS (SELECT 1 FROM "public"."invitaciones" WHERE "businessId" = NEW."id" AND "acceptedAt" IS NULL)
  ) THEN
    RAISE EXCEPTION 'negocios %: no pasa al plan Independiente con integrantes o invitaciones pendientes', NEW."id"
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."plan" = 'equipo'
     AND EXISTS (SELECT 1 FROM "public"."sedes" WHERE "businessId" = NEW."id" AND "activo") THEN
    RAISE EXCEPTION 'negocios %: no pasa al plan Equipo con sedes activas; se desactivan antes', NEW."id"
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER negocios_cambio_de_plan
BEFORE UPDATE OF "plan" ON "public"."negocios"
FOR EACH ROW EXECUTE FUNCTION "public"."negocios_cambio_de_plan"();

-- sedes_reglas: sólo cuando la sede QUEDA activa (nueva, o una inactiva que se
-- reactiva); renombrar o editar una activa, o desactivar una, no pasa por
-- acá. Las reglas son el plan Independiente y el tope de 5 activas por
-- negocio (las otras activas, sin contar a ésta). Al reactivar, las franjas
-- activas de la sede se revalidan: pudieron quedar pisadas con las de otra
-- sede mientras estaba inactiva (las franjas de una sede inactiva no cuentan
-- para nadie). `SET active = active` no cambia nada, pero dispara el trigger de
-- las franjas (que no sale temprano por "no cambió" justamente por esto): si
-- una se pisa, falla su excepción y la sede no se reactiva. Así la regla del
-- solape vive en un solo lugar. Un caso raro que resuelve Postgres: si otra
-- transacción edita esas mismas franjas justo mientras se reactiva la sede,
-- una de las dos recibe un deadlock (40P01) y se reintenta.
CREATE FUNCTION "public"."sedes_reglas"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  plan_del_negocio TEXT;
  otras_activas INTEGER;
BEGIN
  IF NOT NEW."activo" OR (TG_OP = 'UPDATE' AND OLD."activo") THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('plan-y-sedes:' || NEW."businessId"));

  SELECT "plan" INTO plan_del_negocio FROM "public"."negocios" WHERE "id" = NEW."businessId";

  IF plan_del_negocio IS NOT NULL AND plan_del_negocio <> 'independiente' THEN
    RAISE EXCEPTION 'sedes %: sólo el plan Independiente tiene sedes', NEW."id"
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO otras_activas
  FROM "public"."sedes"
  WHERE "businessId" = NEW."businessId" AND "activo" AND "id" <> NEW."id";

  IF otras_activas >= 5 THEN
    RAISE EXCEPTION 'sedes %: un negocio tiene hasta 5 sedes activas', NEW."id"
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    UPDATE "public"."horarios_laborales"
    SET "active" = "active"
    WHERE "sedeId" = NEW."id" AND "businessId" = NEW."businessId" AND "active";
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER sedes_reglas
BEFORE INSERT OR UPDATE ON "public"."sedes"
FOR EACH ROW EXECUTE FUNCTION "public"."sedes_reglas"();

-- horarios_sedes_sin_pisarse: la dueña no está en dos sedes a la vez. Una franja
-- activa con sede no se solapa (inicio < fin de la otra Y fin > inicio de la
-- otra, el mismo día de la semana) con una franja activa de otra sede ACTIVA
-- del mismo negocio. Tocarse (fin = inicio) no es solaparse. Las franjas sin
-- sede, las inactivas y las de una sede inactiva no cuentan. La franja que se
-- escribe no se compara consigo misma: en un UPDATE que le cambia la sede, su
-- versión vieja sigue visible para esta consulta y se pisaría a sí misma. No
-- mira si la sede de la franja que se escribe está activa: así la
-- revalidación de `sedes_reglas` funciona con la sede todavía inactiva. Las
-- "HH:MM" se comparan como texto porque el CHECK de arriba ya garantiza el
-- formato en toda franja con sede.
CREATE FUNCTION "public"."horarios_sedes_sin_pisarse"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  choque RECORD;
BEGIN
  IF NEW."sedeId" IS NULL OR NOT NEW."active" THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('plan-y-sedes:' || NEW."businessId"));

  SELECT s."nombre", h."startTime", h."endTime" INTO choque
  FROM "public"."horarios_laborales" h
  JOIN "public"."sedes" s ON s."id" = h."sedeId" AND s."businessId" = h."businessId"
  WHERE h."businessId" = NEW."businessId"
    AND h."id" <> NEW."id"
    AND h."sedeId" <> NEW."sedeId"
    AND h."active"
    AND s."activo"
    AND h."dayOfWeek" = NEW."dayOfWeek"
    AND NEW."startTime" < h."endTime"
    AND NEW."endTime" > h."startTime"
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'horarios_laborales %: la franja se pisa con la de la sede "%" (% a %) el mismo día', NEW."id", choque."nombre", choque."startTime", choque."endTime"
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER horarios_sedes_sin_pisarse
BEFORE INSERT OR UPDATE ON "public"."horarios_laborales"
FOR EACH ROW EXECUTE FUNCTION "public"."horarios_sedes_sin_pisarse"();

COMMIT;
