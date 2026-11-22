-- Verificar el correo al registrarse (deuda B4). Hasta hoy el registro con
-- correo y contraseña no comprobaba que la casilla fuera de quien se registra:
-- la bienvenida y los avisos de la prueba gratis podían llegarle a un tercero.
--
-- Cuatro columnas en `usuarios`:
--   `emailVerificadoEn`      cuándo la persona demostró que el correo es suyo
--                            (NULL = sin confirmar).
--   `verificacionTokenHash`  sha256 del token del enlace "Confirma tu correo"
--                            (el token en claro sólo existe en el correo).
--   `verificacionVenceEn`    hasta cuándo vale ese enlace (48 horas).
--   `verificacionEnviadaEn`  cuándo se mandó el último enlace.
--
-- Con ellas, la aplicación (lib/verificacion-de-correo.ts) deja que la cuenta
-- funcione igual sin confirmar, pero no le manda los correos del ciclo de
-- prueba (bienvenida, consejo, avisos de fin) hasta que confirme, y le muestra
-- un aviso en el panel. Los correos operativos (reservas, recordatorios,
-- invitaciones, recuperar la contraseña) no dependen de esto.
--
-- Las cuentas que YA EXISTEN quedan verificadas, con la fecha en que se
-- crearon: llevan tiempo recibiendo sus correos y no se les va a pedir ahora
-- que confirmen nada ni se les va a cortar un aviso de la prueba a la mitad.
-- Sólo las cuentas creadas con el código nuevo nacen sin confirmar.
--
-- Aditiva en columnas (nullable, sin default: sólo catálogo), pero el relleno
-- SÍ reescribe todas las filas de `usuarios`. Es una tabla chica (una fila por
-- persona con cuenta) y el UPDATE tarda milisegundos; igual conviene sacar un
-- respaldo antes, porque es una escritura sobre todas las cuentas.
--
-- Orden de despliegue: ANTES de desplegar el código nuevo. El código viejo
-- sigue andando con las columnas puestas (no las lee). El nuevo NO anda sin
-- ellas: Prisma pide todas las columnas de `usuarios` al iniciar sesión
-- (`findUnique` sin `select` en lib/auth.ts), así que sin la migración nadie
-- podría entrar.
--
-- Entre la migración y el despliegue, quien se registre con el código viejo
-- queda con `emailVerificadoEn` en NULL y sin enlace: va a ver el aviso en el
-- panel y lo resuelve con "Reenviar". No hace falta hacer nada a mano.
--
-- Bloqueos: los ADD COLUMN son instantáneos y el índice único se crea sobre
-- una columna toda en NULL; si el candado no llega en 5 segundos, falla entera
-- sin dejar nada a medias y se reintenta.
BEGIN;

SET LOCAL lock_timeout = '5s';

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "emailVerificadoEn" TIMESTAMP(3),
ADD COLUMN     "verificacionTokenHash" TEXT,
ADD COLUMN     "verificacionVenceEn" TIMESTAMP(3),
ADD COLUMN     "verificacionEnviadaEn" TIMESTAMP(3);

-- Las cuentas que ya existen quedan verificadas.
UPDATE "usuarios" SET "emailVerificadoEn" = "createdAt";

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_verificacionTokenHash_key" ON "usuarios"("verificacionTokenHash");

COMMIT;
