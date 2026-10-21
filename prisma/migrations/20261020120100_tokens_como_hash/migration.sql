-- Tokens de recuperación e invitación guardados como hash (auditoría de
-- seguridad, fase 2: M5). El esquema renombra el campo a `tokenHash` con
-- `@map("token")` y quita `@default(cuid())`, que Prisma genera en el cliente:
-- la columna, su tipo y su índice único (`*_token_key`) no cambian. Lo único
-- que hace esta migración es reemplazar cada token guardado por su hash.
--
-- Lo que se guarda es exactamente lo que calcula `hashDeToken` en
-- lib/tokens.ts: sha256 del texto en UTF-8, en hex minúscula (64 caracteres).
-- `sha256(bytea)` es nativa desde Postgres 11 y `encode(..., 'hex')` escribe
-- en minúscula. Así los enlaces vigentes (un cuid en claro en el correo)
-- siguen funcionando: el código hashea el cuid del enlace y lo encuentra.
--
-- No se puede correr dos veces: hashearía el hash. Prisma la registra una
-- sola vez en `_prisma_migrations`. El `WHERE` evita tocar valores que ya
-- parezcan un hash, por si alguien la reaplica a mano.

-- Data
UPDATE "tokens_recuperacion"
SET "token" = encode(sha256(convert_to("token", 'UTF8')), 'hex')
WHERE "token" !~ '^[0-9a-f]{64}$';

UPDATE "invitaciones"
SET "token" = encode(sha256(convert_to("token", 'UTF8')), 'hex')
WHERE "token" !~ '^[0-9a-f]{64}$';
