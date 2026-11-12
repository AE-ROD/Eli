-- Foto de la cuenta (etapa 9, extra f): la persona, no el negocio, tiene su
-- propia foto. Hasta hoy había fotos del negocio (logo y portada, `negocios`) y
-- de cada integrante (`miembros_negocio.fotoUrl`, la que ve el cliente en la
-- reserva); la cuenta (`usuarios`) no tenía y el avatar del panel mostraba las
-- iniciales. Esta foto sigue a la persona en todos sus contextos (clínica y
-- negocio propio), sólo se ve en el panel y NO reemplaza ni hace de respaldo de
-- la del integrante.
--
-- Aditiva y sin pérdida: una sola columna nullable. Sin default, sin NOT NULL
-- y sin relleno, así que Postgres no reescribe la tabla ni toca ninguna fila:
-- todas las cuentas quedan en NULL ("sin foto", se ven las iniciales).
--
-- Lo que agrega:
--   usuarios: `fotoUrl` TEXT. La ruta del propio sitio,
--     `/fotos/usuarios/<id de la cuenta>/cuenta-<uuid>.webp`, igual que
--     `miembros_negocio.fotoUrl` y sus hermanas (`logoUrl`, `coverUrl`).
--
-- Sin CHECK. La columna de la foto del integrante tampoco lo tiene (la
-- migración de la etapa 1 la creó sin restricción), así que no hay criterio de
-- forma de ruta que repetir acá. La forma de la clave y que una cuenta sólo
-- apunte a SU carpeta (`usuarios/<su id>/`) las exige la aplicación
-- (`claveDeFotoDeLaCuenta`, lib/almacenamiento-de-fotos.ts), al escribir y al
-- leer: un `fotoUrl` armado a mano que apunte a otra carpeta se rechaza.
--
-- Orden de despliegue: se aplica ANTES de desplegar el código nuevo. El código
-- viejo sigue andando con la columna ya puesta (no la lee ni la escribe). El
-- nuevo NO anda sin ella: Prisma pide todas las columnas de `usuarios` en cada
-- `findUnique` sin `select` (el inicio de sesión, `lib/auth.ts`, el registro y
-- recuperar la contraseña), así que sin la columna esas consultas fallan. Por
-- eso el orden es primero migración, después despliegue; no al revés.
--
-- Bloqueos. Un `ALTER TABLE` toma un candado exclusivo sobre `usuarios` hasta el
-- COMMIT, y el inicio de sesión la lee a cada rato. El `ADD COLUMN` sin default
-- es sólo un cambio de catálogo (instantáneo), pero si un candado no llega en 5
-- segundos (una consulta larga en curso) falla entera, sin dejar nada a medias,
-- y se reintenta en otro momento. Respaldo: no hace falta uno aparte para esta
-- migración (no reescribe ni borra filas), aunque el del despliegue completo
-- (README.md, "Migraciones en producción") cubre la corrida.
--
-- Va entera en una transacción explícita. Se aplica con psql
-- (`-v ON_ERROR_STOP=1`). Prisma no representa nada que esta migración agregue
-- fuera del esquema: `migrate dev` no encontrará "drift" por ella.
BEGIN;

-- Si el candado de `usuarios` tuviera que esperar más de 5 segundos, falla
-- entera en vez de dejar el inicio de sesión en fila detrás de ella.
SET LOCAL lock_timeout = '5s';

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "fotoUrl" TEXT;

COMMIT;
