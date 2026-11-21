-- Sacar a alguien del equipo. Hasta hoy no se podía: la persona seguía
-- apareciendo en la reserva pública, en los selectores y con acceso al panel.
-- No se borra la fila del integrante: sus liquidaciones, adelantos, propinas y
-- (en la clínica) evoluciones y prótesis la referencian con FK NO ACTION, y la
-- plata que le queda pendiente se tiene que poder liquidar después. Se ARCHIVA:
-- `archivadoEn` con la fecha en que la sacaron.
--
-- Con `archivadoEn`, la aplicación (lib/equipo-activo.ts) la deja fuera de todo
-- lo que es "quién trabaja hoy" (reserva pública, agenda, selectores, tablero,
-- la sesión: pierde el acceso en la próxima revalidación, 5 minutos como
-- máximo) y la sigue mostrando en lo que es historia y plata (liquidaciones,
-- comisiones, reportes, historial).
--
-- Aditiva y sin pérdida: una sola columna nullable, sin default y sin relleno.
-- Postgres no reescribe la tabla; todas las filas quedan en NULL (en el equipo).
--
-- Orden de despliegue: ANTES de desplegar el código nuevo. El código viejo
-- sigue andando con la columna puesta (no la lee). El nuevo NO anda sin ella:
-- filtra por `archivadoEn` al iniciar sesión y en la reserva pública.
--
-- Bloqueos: el ADD COLUMN sin default es sólo catálogo (instantáneo); si el
-- candado no llega en 5 segundos, falla entera sin dejar nada a medias y se
-- reintenta. No hace falta un respaldo aparte (no reescribe ni borra filas).
BEGIN;

SET LOCAL lock_timeout = '5s';

-- AlterTable
ALTER TABLE "miembros_negocio" ADD COLUMN     "archivadoEn" TIMESTAMP(3);

COMMIT;
