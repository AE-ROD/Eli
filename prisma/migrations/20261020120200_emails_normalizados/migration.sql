-- Emails de cuenta normalizados (auditoría de seguridad, fase 2: B4). Desde
-- este cambio el código guarda y busca el email de una cuenta sin espacios en
-- las puntas y en minúsculas (`normalizarEmail`, lib/validaciones.ts). Las
-- cuentas existentes se pasan al mismo formato, o quien se registró con
-- mayúsculas dejaría de encontrar su cuenta al entrar.
--
-- Si dos cuentas quedarían con el mismo email (`Ana@x.com` y `ana@x.com`), la
-- migración se detiene ANTES de tocar nada: el índice único lo impediría a
-- mitad de camino, y unirlas es una decisión de negocio (de quién son las
-- citas, el negocio, las membresías), no algo que una migración resuelva
-- sola. Para verlas:
--   SELECT lower(trim("email")), array_agg("id") FROM "usuarios"
--   GROUP BY 1 HAVING count(*) > 1;
-- El mensaje no lista los emails para no dejarlos en los logs del deploy.
--
-- `trim` de Postgres quita sólo espacios y `lower` sigue la collation de la
-- base; para direcciones ASCII coincide exactamente con `trim()` y
-- `toLowerCase()` de JavaScript.

-- Data
DO $$
DECLARE
  repetidos integer;
BEGIN
  SELECT count(*) INTO repetidos
  FROM (
    SELECT lower(trim("email"))
    FROM "usuarios"
    GROUP BY 1
    HAVING count(*) > 1
  ) AS grupos;

  IF repetidos > 0 THEN
    RAISE EXCEPTION 'No se normalizaron los emails: % email(s) quedarían repetidos en "usuarios" al pasarlos a minúsculas. Hay que unir o renombrar esas cuentas a mano antes de reintentar (ver la consulta en esta migración).', repetidos;
  END IF;
END $$;

UPDATE "usuarios"
SET "email" = lower(trim("email"))
WHERE "email" <> lower(trim("email"));

-- Las invitaciones no tienen email único: no hay repetidos que cuidar.
UPDATE "invitaciones"
SET "email" = lower(trim("email"))
WHERE "email" <> lower(trim("email"));
