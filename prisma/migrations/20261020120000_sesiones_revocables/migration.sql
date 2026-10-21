-- Sesiones revocables (auditoría de seguridad, fase 2: A2/M4). Aditiva y sin
-- pérdida: la columna nace en null para todos, que es "nunca se cerraron", así
-- que ninguna sesión vigente se corta al aplicarla. Restablecer la contraseña
-- la pone en "ahora" y `lib/auth.ts` rechaza los tokens emitidos antes.

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN "sesionesValidasDesde" TIMESTAMP(3);
