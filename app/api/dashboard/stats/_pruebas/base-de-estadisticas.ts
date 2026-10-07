import { vi } from "vitest"
import { crearBaseFalsa, type NombreDeModelo } from "@/app/api/atenciones/_pruebas/base-falsa"

type Registro = Record<string, unknown>

/**
 * La base falsa del tablero (`app/api/atenciones/_pruebas/`) con lo que pide
 * `/api/dashboard/stats` y el tablero no usa, como `base-de-clientes.ts`:
 *
 * - `aggregate` con `_sum`, que filtra con el mismo `where` que el resto de
 *   la base (relaciones incluidas, y lanza ante lo que no entiende) y suma de
 *   verdad. Así un test de ingresos comprueba qué pagos entran a la suma, no
 *   qué argumento recibió Prisma.
 * - Los horarios del profesional (`workSchedule`), vacíos: estos tests son
 *   de ingresos.
 */
export function crearBaseDeEstadisticas() {
  const base = crearBaseFalsa()

  function agregado(modelo: NombreDeModelo) {
    return vi.fn(async (args: Registro = {}) => {
      const { where, _sum, ...resto } = args
      if (Object.keys(resto).length > 0) {
        throw new Error(`base falsa: aggregate con ${Object.keys(resto).join(", ")} no está implementado`)
      }
      if (typeof _sum !== "object" || _sum === null) throw new Error("base falsa: aggregate sin _sum")

      const filas = base.buscar(modelo, where as Registro | undefined)
      const suma: Record<string, number | null> = {}
      for (const [campo, pedido] of Object.entries(_sum)) {
        if (!pedido) continue
        const valores = filas.map((fila) => fila[campo])
        // Las columnas de dinero son `Int`: un valor que no es entero es un
        // escenario mal escrito, o un campo que no existe.
        if (!valores.every((valor) => Number.isInteger(valor))) {
          throw new Error(`base falsa: _sum de ${modelo}.${campo}, que no es una columna de enteros`)
        }
        // Como SQL: la suma de ninguna fila es NULL, no 0.
        suma[campo] = filas.length === 0 ? null : (valores as number[]).reduce((total, valor) => total + valor, 0)
      }
      return { _sum: suma }
    })
  }

  return {
    ...base,
    prisma: {
      ...base.prisma,
      visitPayment: { ...base.prisma.visitPayment, aggregate: agregado("visitPayment") },
      workSchedule: { findMany: vi.fn(async () => []) },
    },
  }
}
