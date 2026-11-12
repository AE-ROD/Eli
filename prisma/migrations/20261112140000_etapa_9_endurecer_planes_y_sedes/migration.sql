-- Endurecer planes y sedes (etapa 9): dos arreglos que salieron de la revisión
-- de seguridad de la etapa, en una migración nueva. Las dos anteriores de la
-- etapa (`20261112120000_etapa_9_planes_y_sedes` y
-- `20261112130000_etapa_9_foto_de_la_cuenta`) pueden estar aplicadas, así que
-- no se editan: Prisma guarda el checksum de cada una.
--
-- Qué hace
-- ────────
-- 1) Corrige el relleno de `negocios.plan`. La migración de planes y sedes pasó
--    a "independiente" a todo negocio sin integrantes ni invitaciones
--    pendientes, sin mirar `negocios.teamSize` (cuántas personas dijo el
--    negocio que son al crearse, de 1 a 500). Un negocio que declaró más de
--    una persona y todavía no invitó a nadie quedó en Independiente y perdió
--    la opción de invitar. Este UPDATE lo devuelve a "equipo".
-- 2) Cierra una carrera entre crear una hora en una sede y desactivar esa sede.
--    Desactivar una sede cuenta las horas por delante bajo el candado del
--    negocio, pero crear una cita (o una inscripción en la lista de espera)
--    validaba la sede en la aplicación, fuera de ese candado, y la FK compuesta
--    (sedeId, businessId) no mira `activo`. Si la dueña desactivaba la sede
--    (0 horas por delante) justo mientras un cliente confirmaba una hora ahí,
--    las dos pasaban y quedaba una hora futura en una sede inactiva; si luego
--    el negocio pasaba a Equipo, esa hora quedaba atada a una sede que ya no
--    existe para él.
--
-- 1) El relleno de teamSize
-- ─────────────────────────
-- Sólo pasa a "equipo" lo que cumple las tres: plan "independiente", teamSize
-- mayor que 1 y ninguna fila en `sedes` (activa o no).
--
-- Por qué es seguro:
--   * El trigger `negocios_cambio_de_plan` (de la migración anterior) deja
--     pasar a "equipo" siempre que el negocio no tenga sedes ACTIVAS, y la
--     tercera condición lo garantiza (y evita que la migración falle entera
--     por un negocio que sí las tuviera). Corre con ese trigger puesto: toma
--     su candado por negocio, un candado por fila actualizada, que Postgres
--     suelta al COMMIT; con los negocios que hay hoy sobra holgura en la tabla
--     de candados.
--   * Va justo después de la migración de planes y sedes, en el mismo
--     despliegue y antes de desplegar el código: nadie ha podido cambiar de
--     plan en el medio (el endpoint que lo permite, `PATCH
--     /api/configuracion/plan`, no existe en el código viejo). Por eso todo
--     "independiente" con teamSize > 1 sale del relleno de esa migración y no
--     de una decisión de la dueña: el código nuevo crea los negocios
--     Independiente con teamSize 1 (`personasAlCrearElNegocio`), y el
--     default de la base es "equipo".
--   * No toca `updatedAt`: no es un cambio que hizo el negocio. No toca
--     ninguna otra columna ni ninguna otra fila.
--   * NO se vuelve a correr después de desplegar: un negocio que pasa de
--     Equipo a Independiente con el código nuevo conserva su teamSize, y esto
--     lo devolvería a "equipo" contra su voluntad (el tercer criterio sólo lo
--     salva si ya tiene sedes).
--
-- 2) Los dos triggers nuevos
-- ──────────────────────────
-- Los dos con `SET search_path = public`, sin SECURITY DEFINER, `RAISE
-- EXCEPTION … USING ERRCODE = 'check_violation'` (23514) como los de la
-- migración anterior, y el MISMO candado por negocio
-- (`pg_advisory_xact_lock(hashtext('plan-y-sedes:' || businessId))`) que toma
-- la aplicación al desactivar una sede o cambiar de plan:
--   citas_exigen_sede_activa (BEFORE INSERT OR UPDATE OF "sedeId", "status",
--     "startTime" en citas) y lista_de_espera_exige_sede_activa (BEFORE
--     INSERT OR UPDATE OF "sedeId", "estado" en lista_de_espera): una fila
--     viva con sede exige que la sede esté activa.
--
-- Cuándo miran. Sólo cuando la fila lleva `sedeId` y queda viva. Viva es lo
-- mismo que cuenta la aplicación como "hora por delante"
-- (`ESTADOS_DE_HORA_POR_DELANTE` y `whereDeHorasPorDelante`,
-- lib/sedes-servidor.ts): una cita "pendiente" o "confirmada" con `startTime`
-- en el futuro; una inscripción, "activa". Todo lo demás sale sin tomar el
-- candado y sin fallar: una fila sin sede (todos los negocios de hoy y el plan
-- Equipo: una reserva normal no paga nada), una cita pasada, cancelada,
-- completada o de "no vino", una inscripción resuelta. Así cancelar o completar
-- una hora vieja de una sede desactivada sigue andando.
--
-- Y en un UPDATE sólo cuando la fila se vuelve viva en esa sede (antes no lo
-- estaba, o estaba viva en otra sede): reactivar una cancelada, mover una
-- pasada al futuro, poner o cambiar la sede. Una fila que ya estaba viva en la
-- misma sede no se vuelve a juzgar: ya la contó la desactivación (por eso
-- quedó bloqueada si tenía horas), y confirmarla o cambiarle la hora no la
-- expone a nada nuevo.
--
-- La carrera. Quien llega segundo espera el candado y después lee. Si la
-- desactivación gana, la fila ve la sede inactiva y se rechaza; si la fila
-- gana, la desactivación cuenta la hora (la ve confirmada) y se rechaza. Nunca
-- pasan las dos. La reserva pública corre en una transacción Serializable, que
-- lee con la foto de cuando empezó: aunque espere el candado, un SELECT común
-- vería la sede como estaba entonces (activa) y la carrera quedaría abierta.
-- Por eso el SELECT de la sede lleva `FOR SHARE`: si la sede cambió después de
-- esa foto, Postgres aborta con 40001 (serialization_failure, P2034 en
-- Prisma), la reserva reintenta con una foto nueva y ahí el trigger la rechaza
-- con el mensaje claro. (Probado contra Postgres 16: `FOR KEY SHARE`, el
-- candado de fila que toma la FK, NO aborta y deja la carrera abierta.) `FOR
-- SHARE` frena la edición de esa fila de la sede hasta el COMMIT de la hora
-- que se está creando (milisegundos), no su lectura ni la FK. No puede
-- cruzarse con otra transacción: toda escritura de sedes de la aplicación
-- toma antes el candado del negocio, que este trigger toma primero.
--
-- La hora se compara con `now() AT TIME ZONE 'UTC'`: `startTime` es TIMESTAMP
-- sin zona y Prisma lo guarda en UTC, así que no depende de la zona de la
-- sesión. Si la sede no existe (o es de otro negocio), el trigger la deja pasar
-- y la rechaza la FK compuesta, como `invitaciones_exigen_plan_equipo` con el
-- negocio.
--
-- Compatibilidad. El código viejo no escribe `sedeId`, así que nunca entra en
-- los triggers. El código nuevo anda con y sin esta migración (la aplicación
-- ya valida la sede; esta es la segunda barrera), así que no es un requisito
-- para desplegar, pero va en la misma ventana que la de planes y sedes: sin
-- ella la carrera sigue abierta.
--
-- Bloqueos. El UPDATE toma un candado de fila por negocio actualizado y
-- ROW EXCLUSIVE sobre `negocios`. `CREATE TRIGGER` toma SHARE ROW EXCLUSIVE
-- sobre `citas` y `lista_de_espera` hasta el COMMIT: las escrituras de esas dos
-- tablas esperan detrás (un instante; no revisa filas). Con `SET LOCAL
-- lock_timeout = '5s'`: si un candado no llega en 5 segundos, falla entera sin
-- dejar nada a medias y se reintenta en otro momento. Sin `ALTER TABLE`: no
-- reescribe ni agrega columnas.
--
-- Deshacerla (sólo los triggers; el relleno no se deshace): DROP TRIGGER
-- citas_exigen_sede_activa ON citas; DROP TRIGGER
-- lista_de_espera_exige_sede_activa ON lista_de_espera; y DROP FUNCTION de las
-- dos funciones.
--
-- Prisma no representa los triggers: si alguien corre `migrate dev`, revisar
-- que no los borre por "drift".
--
-- Va entera en una transacción explícita. Se aplica con psql
-- (`-v ON_ERROR_STOP=1`). Orden de despliegue: README.md, sección
-- "Migraciones en producción": con respaldo, junto con las dos anteriores de la
-- etapa 9 y en el orden de su fecha, ANTES de desplegar.
BEGIN;

-- Si algo tuviera que esperar un candado más de 5 segundos, falla entera (sin
-- dejar nada a medias) en vez de dejar las escrituras del local en fila detrás
-- de ella. Se reintenta en otro momento.
SET LOCAL lock_timeout = '5s';

-- ─── 1) El relleno de teamSize ──────────────────────────────────────────────
-- Antes de los triggers de abajo (que no tocan `negocios`). Pasa por el trigger
-- `negocios_cambio_de_plan` de la migración anterior, que acá no rechaza nada
-- (ver arriba).
UPDATE "negocios" n
SET "plan" = 'equipo'
WHERE n."plan" = 'independiente'
  AND n."teamSize" > 1
  AND NOT EXISTS (SELECT 1 FROM "sedes" s WHERE s."businessId" = n."id");

-- ─── 2) La sede de una hora viva está activa ────────────────────────────────

-- citas_exigen_sede_activa: una cita pendiente o confirmada, por delante, con
-- sede, exige que la sede esté activa.
CREATE FUNCTION "public"."citas_exigen_sede_activa"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ahora TIMESTAMP := now() AT TIME ZONE 'UTC';
  sede_activa BOOLEAN;
BEGIN
  IF NEW."sedeId" IS NULL OR NEW."status" NOT IN ('pendiente', 'confirmada') OR NEW."startTime" <= ahora THEN
    RETURN NEW;
  END IF;

  -- Ya estaba viva en esta misma sede: esta escritura no la expone a nada nuevo.
  IF TG_OP = 'UPDATE'
     AND OLD."sedeId" IS NOT DISTINCT FROM NEW."sedeId"
     AND OLD."status" IN ('pendiente', 'confirmada')
     AND OLD."startTime" > ahora THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('plan-y-sedes:' || NEW."businessId"));

  SELECT "activo" INTO sede_activa
  FROM "public"."sedes"
  WHERE "id" = NEW."sedeId" AND "businessId" = NEW."businessId"
  FOR SHARE;

  IF FOUND AND NOT sede_activa THEN
    RAISE EXCEPTION 'citas %: la sede % no está activa', NEW."id", NEW."sedeId"
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER citas_exigen_sede_activa
BEFORE INSERT OR UPDATE OF "sedeId", "status", "startTime" ON "public"."citas"
FOR EACH ROW EXECUTE FUNCTION "public"."citas_exigen_sede_activa"();

-- lista_de_espera_exige_sede_activa: una inscripción activa con sede exige que
-- la sede esté activa. Una inscripción que ya estaba activa en una sede
-- desactivada (se desactiva con ellas adentro) no falla al resolverse
-- ("reservo", "expirada", "salio"): sólo mira cuando queda "activa".
CREATE FUNCTION "public"."lista_de_espera_exige_sede_activa"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  sede_activa BOOLEAN;
BEGIN
  IF NEW."sedeId" IS NULL OR NEW."estado" <> 'activa' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."sedeId" IS NOT DISTINCT FROM NEW."sedeId" AND OLD."estado" = 'activa' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('plan-y-sedes:' || NEW."businessId"));

  SELECT "activo" INTO sede_activa
  FROM "public"."sedes"
  WHERE "id" = NEW."sedeId" AND "businessId" = NEW."businessId"
  FOR SHARE;

  IF FOUND AND NOT sede_activa THEN
    RAISE EXCEPTION 'lista_de_espera %: la sede % no está activa', NEW."id", NEW."sedeId"
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER lista_de_espera_exige_sede_activa
BEFORE INSERT OR UPDATE OF "sedeId", "estado" ON "public"."lista_de_espera"
FOR EACH ROW EXECUTE FUNCTION "public"."lista_de_espera_exige_sede_activa"();

COMMIT;
