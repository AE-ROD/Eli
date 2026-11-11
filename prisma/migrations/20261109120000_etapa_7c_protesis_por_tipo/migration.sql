-- Prótesis, correcciones del dueño (2026-11-09): sin cordales, etapas por
-- tipo y tono del diente. Escrita a mano en el estilo de
-- `etapa_7_protesis`, que no se toca (puede estar aplicada), igual que
-- `etapa_7b_abonos_de_protesis`.
--
-- Lo que cambia:
--   1. Sin cordales: las piezas que terminan en 8 (18, 28, 38, 48) no son
--      piezas protésicas ni pilares. La total marca todas las piezas de la
--      arcada MENOS los cordales: `protesis_total_check` se reemplaza y el
--      CHECK nuevo `protesis_sin_cordales_check` los prohíbe en el resto.
--   2. Etapas por tipo, en vez de Impresión → En laboratorio → Prueba en
--      boca → Ajustes → Entregada:
--        removible y total:        impresion → rodete → enfilado → entregada
--        fija, corona e implante:  impresion → prueba → entregada
--      (más 'anulada' antes de entregar). Desaparece el paso "en
--      laboratorio" y con él la exigencia de laboratorio para avanzar: el
--      laboratorio sigue siendo un dato de la prótesis. Se reemplazan
--      `protesis_estado_check` (que además ata los pasos al tipo) y
--      `eventos_de_protesis_estado_check`, y la función y el trigger
--      `protesis_congelada` (orden de pasos según el tipo).
--   3. Tono del diente (guía VITA classical): columna nueva `protesis.tono`,
--      nullable y sin default (no reescribe la tabla), con
--      `protesis_tono_check` (los ids de `TONOS_VITA`, lib/protesis.ts: si
--      cambia uno, cambia el otro). Se puede cambiar mientras la prótesis no
--      esté entregada ni anulada: `protesis_congelada` lo trata como el
--      laboratorio o la entrega estimada (no es parte del diseño congelado).
--
-- `protesis_entregada_check` y `protesis_anulada_check` no cambian: sólo
-- nombran 'entregada' y 'anulada', que siguen igual. Tampoco el trigger de
-- la etapa 7b sobre el pago al laboratorio (mira `entregadaEn`).
--
-- Filas existentes (lo único que reescribe; se convierte, no se borra nada):
--   - protesis.estado: 'en-laboratorio' → 'impresion'; 'prueba' y 'ajustes'
--     → 'enfilado' en removible y total, y → 'prueba' en fija, corona e
--     implante. 'impresion', 'entregada' y 'anulada' quedan igual. El
--     reparto, el valor y las fechas no se tocan.
--   - eventos_de_protesis.estado: la misma conversión, según el tipo de su
--     prótesis. Un evento es un registro que no se edita
--     (`eventos_de_protesis_inmutables`): el trigger se desactiva SÓLO para
--     esta conversión, dentro de la transacción, y se vuelve a activar antes
--     del COMMIT. Si un paso queda dos veces (p. ej. el viejo "En
--     laboratorio" pasa a ser una segunda "Toma de impresión"), se conservan
--     los dos: la aplicación toma el primero para la fecha de cada etapa.
--   - protesis.piezas de una total: se le sacan los cordales. El valor de
--     una total es por arcada, así que no cambia ni el valor ni las
--     unidades.
--   - Una prótesis que NO es total y tiene un cordal (pieza protésica o
--     pilar):
--       · entregada o anulada: se deja como está. Ya no cambia (trigger) y es
--         historia: `protesis_sin_cordales_check` no mira las cerradas.
--       · en curso: la migración NO se aplica (RAISE con los ids y no queda
--         nada a medias). Su valor por pieza depende de las piezas, así que
--         no se corrige sola: antes de aplicar, anularla desde la ficha (con
--         el código de hoy) y crearla de nuevo sin el cordal, o entregarla.
--         Se descartó dejar el CHECK `NOT VALID`: Postgres revisa la fila
--         entera en cada UPDATE, así que esa prótesis no podría ni avanzar
--         ni anularse después.
--
-- Rompe la compatibilidad en los dos sentidos, sólo en el seguimiento de las
-- prótesis: el código viejo, con esta migración aplicada, falla al pasar a
-- "En laboratorio", "Prueba en boca" (removible y total) o "Ajustes"; el
-- código nuevo lee `protesis.tono` y escribe los pasos nuevos: sin ella falla
-- la pestaña Prótesis de la ficha (el cobro de abonos, la liquidación y el
-- pago al laboratorio no leen el tono). Se aplica y se despliega enseguida,
-- en una ventana tranquila (README.md, "Migraciones en producción").
--
-- Va entera en una transacción explícita: si algo falla a mitad, no queda
-- aplicada a medias. Se aplica con psql (`-v ON_ERROR_STOP=1`). Requiere
-- `20261108120000_etapa_7_protesis` y `20261108130000_etapa_7b_abonos_de_protesis`
-- aplicadas antes.
BEGIN;

-- ─── Antes de tocar nada: prótesis en curso con cordales ────────────────────

DO $$
DECLARE
  ids TEXT;
BEGIN
  SELECT string_agg("id", ', ' ORDER BY "id") INTO ids
  FROM "public"."protesis"
  WHERE "tipo" <> 'total'
    AND "estado" NOT IN ('entregada', 'anulada')
    AND ("piezas" || "pilares") && ARRAY[18, 28, 38, 48]::INTEGER[];
  IF ids IS NOT NULL THEN
    RAISE EXCEPTION 'etapa_7c: hay prótesis en curso con un cordal (18, 28, 38 o 48), que ya no se permite: %', ids
      USING HINT = 'Anúlalas (o entrégalas) desde la ficha antes de aplicar esta migración y créalas de nuevo sin el cordal. No se aplicó nada.';
  END IF;
END;
$$;

-- ─── El trigger viejo sale primero ──────────────────────────────────────────
-- Prohíbe volver atrás ('en-laboratorio' → 'impresion') y cambiar las piezas,
-- que es justo lo que hace la conversión. Se crea el nuevo al final.

DROP TRIGGER "protesis_congelada" ON "public"."protesis";
DROP FUNCTION "public"."protesis_congelada"();

-- ─── CHECKs que cambian: salen antes de convertir ───────────────────────────

ALTER TABLE "protesis" DROP CONSTRAINT "protesis_estado_check";
ALTER TABLE "protesis" DROP CONSTRAINT "protesis_total_check";
ALTER TABLE "eventos_de_protesis" DROP CONSTRAINT "eventos_de_protesis_estado_check";

-- ─── Columna nueva ──────────────────────────────────────────────────────────
-- Nullable y sin default: Postgres no reescribe la tabla.

-- AlterTable
ALTER TABLE "protesis" ADD COLUMN "tono" TEXT;

-- ─── Conversión de las filas existentes ─────────────────────────────────────

-- La total, sin cordales (el valor es por arcada: no cambia).
UPDATE "protesis"
SET "piezas" = ARRAY(SELECT p FROM unnest("piezas") AS p WHERE p NOT IN (18, 28, 38, 48) ORDER BY p),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "tipo" = 'total' AND "piezas" && ARRAY[18, 28, 38, 48]::INTEGER[];

-- El estado, según el tipo.
UPDATE "protesis"
SET "estado" = CASE
      WHEN "estado" = 'en-laboratorio' THEN 'impresion'
      WHEN "tipo" IN ('removible', 'total') THEN 'enfilado'
      ELSE 'prueba'
    END,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "estado" IN ('en-laboratorio', 'prueba', 'ajustes');

-- Los eventos, con la misma regla. El trigger de inmutabilidad se desactiva
-- sólo para este UPDATE y vuelve enseguida (ALTER TABLE toma un bloqueo
-- exclusivo de `eventos_de_protesis` hasta el COMMIT: es una tabla chica).
ALTER TABLE "eventos_de_protesis" DISABLE TRIGGER "eventos_de_protesis_inmutables";

UPDATE "eventos_de_protesis" e
SET "estado" = CASE
      WHEN e."estado" = 'en-laboratorio' THEN 'impresion'
      WHEN p."tipo" IN ('removible', 'total') THEN 'enfilado'
      ELSE 'prueba'
    END
FROM "protesis" p
WHERE p."id" = e."protesisId"
  AND e."estado" IN ('en-laboratorio', 'prueba', 'ajustes');

ALTER TABLE "eventos_de_protesis" ENABLE TRIGGER "eventos_de_protesis_inmutables";

-- ─── Restricciones CHECK, escritas a mano ───────────────────────────────────
-- Repiten las reglas de `lib/protesis.ts` (si cambia una, cambia la otra).
-- Sin NOT VALID: las filas ya están convertidas y se revisan todas.

-- Los pasos de cada tipo: rodete y enfilado sólo en removible y total; la
-- prueba única sólo en fija, corona e implante.
ALTER TABLE "protesis" ADD CONSTRAINT "protesis_estado_check"
CHECK ("estado" IN ('impresion', 'rodete', 'enfilado', 'prueba', 'entregada', 'anulada')
   AND ("estado" NOT IN ('rodete', 'enfilado') OR "tipo" IN ('removible', 'total'))
   AND ("estado" <> 'prueba' OR "tipo" IN ('fija', 'implante', 'corona')));

-- Un evento no sabe su tipo: los valores, y el paso lo cuida la aplicación
-- (y `protesis_estado_check` sobre la prótesis, que se escribe en la misma
-- transacción).
ALTER TABLE "eventos_de_protesis" ADD CONSTRAINT "eventos_de_protesis_estado_check"
CHECK ("estado" IN ('impresion', 'rodete', 'enfilado', 'prueba', 'entregada', 'anulada'));

-- Sin cordales, salvo en lo ya entregado o anulado (historia que no cambia).
ALTER TABLE "protesis" ADD CONSTRAINT "protesis_sin_cordales_check"
CHECK ("estado" IN ('entregada', 'anulada') OR NOT (("piezas" || "pilares") && ARRAY[18, 28, 38, 48]::INTEGER[]));

-- La total reemplaza la arcada entera menos los cordales (exactamente esas
-- piezas, con `protesis_piezas_de_la_arcada_check`), sin pilares.
ALTER TABLE "protesis" ADD CONSTRAINT "protesis_total_check"
CHECK ("tipo" <> 'total' OR (cardinality("pilares") = 0
   AND NOT ("piezas" && ARRAY[18, 28, 38, 48]::INTEGER[])
   AND ("arcada" = 'inferior' OR "piezas" @> ARRAY[11, 12, 13, 14, 15, 16, 17, 21, 22, 23, 24, 25, 26, 27]::INTEGER[])
   AND ("arcada" = 'superior' OR "piezas" @> ARRAY[31, 32, 33, 34, 35, 36, 37, 41, 42, 43, 44, 45, 46, 47]::INTEGER[])));

-- El tono: un id de la guía VITA classical (`TONOS_VITA`), o ninguno.
ALTER TABLE "protesis" ADD CONSTRAINT "protesis_tono_check"
CHECK ("tono" IS NULL OR "tono" IN ('0M1', '0M2', '0M3', 'A1', 'A2', 'A3', 'A3.5', 'A4', 'B1', 'B2', 'B3', 'B4',
                                    'C1', 'C2', 'C3', 'C4', 'D2', 'D3', 'D4'));

-- ─── Trigger ────────────────────────────────────────────────────────────────

-- protesis_congelada: lo que se copió al crear la prótesis (diseño, material,
-- precio, valor, reparto, tratante, paciente, quién la creó) no cambia. Sólo
-- se mueven el estado (hacia adelante por los pasos de su tipo, saltando
-- pasos si hace falta, o a Anulada), el laboratorio, la entrega estimada, el
-- tono y las fechas de entrega y anulación; y `memberId` sólo pasa a null
-- (desvincular a la tratante, para poder borrar después al miembro: su nombre
-- queda copiado). Una entregada o anulada ya no cambia nada de eso. Se
-- compara la fila entera menos esas columnas, así que una columna que se
-- agregue en el futuro también queda fija. Igual que la de la etapa 7, más
-- `tono` y los pasos por tipo.
CREATE FUNCTION "public"."protesis_congelada"() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  movibles TEXT[] := ARRAY['estado', 'laboratorioId', 'laboratorioNombre', 'entregaEstimada', 'tono', 'entregadaEn',
                           'anuladaEn', 'anuladaPorNombre', 'memberId', 'updatedAt'];
  pasos TEXT[];
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
    OR NEW."tono" IS DISTINCT FROM OLD."tono"
    OR NEW."entregadaEn" IS DISTINCT FROM OLD."entregadaEn"
    OR NEW."anuladaEn" IS DISTINCT FROM OLD."anuladaEn"
    OR NEW."anuladaPorNombre" IS DISTINCT FROM OLD."anuladaPorNombre"
  ) THEN
    RAISE EXCEPTION 'protesis %: una prótesis entregada o anulada ya no cambia', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW."estado" IS DISTINCT FROM OLD."estado" AND NEW."estado" <> 'anulada' THEN
    -- El tipo no cambia (está en la fila congelada): los pasos son los de OLD.
    pasos := CASE WHEN OLD."tipo" IN ('removible', 'total')
                  THEN ARRAY['impresion', 'rodete', 'enfilado', 'entregada']::TEXT[]
                  ELSE ARRAY['impresion', 'prueba', 'entregada']::TEXT[] END;
    paso_viejo := array_position(pasos, OLD."estado");
    paso_nuevo := array_position(pasos, NEW."estado");
    IF paso_nuevo IS NULL OR paso_viejo IS NULL OR paso_nuevo <= paso_viejo THEN
      RAISE EXCEPTION 'protesis %: el seguimiento sólo avanza por los pasos de su tipo', OLD."id"
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER protesis_congelada
BEFORE UPDATE ON "public"."protesis"
FOR EACH ROW EXECUTE FUNCTION "public"."protesis_congelada"();

COMMIT;
