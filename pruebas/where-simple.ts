/**
 * Si un registro cumple un `where` de Prisma de los más simples: igualdad,
 * `AND` e `in`. Lo usan los tests de aislamiento que arman su propio mock de
 * Prisma sin la base falsa (`base-falsa.ts`, que entiende mucho más y lanza
 * ante lo que no conoce). Éste no lanza: lo que no entiende lo compara por
 * igualdad, así que sólo sirve para los `where` que arma `lib/permisos.ts`.
 */
export function coincideConWhere(item: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([clave, valor]) => {
    if (clave === "AND") {
      return (valor as Record<string, unknown>[]).every((sub) => coincideConWhere(item, sub))
    }
    if (valor && typeof valor === "object" && "in" in (valor as Record<string, unknown>)) {
      return ((valor as { in: unknown[] }).in).includes(item[clave])
    }
    return item[clave] === valor
  })
}
