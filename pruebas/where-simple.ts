import { RELACIONES, coincide, type NombreDeModelo, type Registro, type Tablas } from "./consultas-falsas"

/**
 * Si un registro cumple un `where` de Prisma, para los tests de aislamiento
 * que arman su propio doble de Prisma sin la base falsa (`base-falsa.ts`).
 *
 * Lee el `where` con `coincide` de `consultas-falsas.ts`, la misma regla que
 * la base falsa: **ante lo que no entiende, lanza** (un operador, un campo que
 * la fila no tiene, una relación que el modelo no tiene), y un `undefined` se
 * ignora, como en Prisma. Antes este helper devolvía `false` ante lo que no
 * conocía y comparaba `undefined` por igualdad: un filtro de aislamiento
 * escrito con otro operador pasaba en verde por la razón equivocada (F-018).
 *
 * `tablas` son las otras tablas, para un `where` que filtra por una relación
 * (`customer: { ... }`); sin ellas, la relación no tiene filas.
 */
export function coincideConWhere(
  modelo: NombreDeModelo,
  registro: Registro,
  where: unknown,
  tablas: Partial<Tablas> = {}
): boolean {
  const vacias = Object.fromEntries(Object.keys(RELACIONES).map((nombre) => [nombre, []])) as unknown as Tablas
  return coincide({ ...vacias, [modelo]: [registro], ...tablas }, modelo, registro, where)
}
