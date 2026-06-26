import type { PrismaClient } from "@prisma/client"
import type { ResultadoParseo } from "@/lib/import/tipos"
import { agregarError, campo, crearResultado, fechaCampo, montoCampo, type FilaParser } from "./_helpers"

export interface CajaChicaImportada {
  date: Date
  cashOpening: number
  cashClosing: number
  expenses: { desc: string; amount: number }[]
  denominations: { bill: string; quantity: number }[]
}

export async function parsearCajaChica(
  filas: FilaParser[],
  _businessId: string,
  _prisma: PrismaClient
): Promise<ResultadoParseo<CajaChicaImportada>> {
  const resultado = crearResultado<CajaChicaImportada>()
  const grupos = new Map<string, CajaChicaImportada & { indice: number }>()

  filas.forEach((fila, i) => {
    const indice = i + 2
    const date = fechaCampo(fila, ["fecha"])
    const cashOpening = montoCampo(fila, ["apertura"])
    const cashClosing = montoCampo(fila, ["cierre"])

    if (!date) agregarError(resultado.errores, indice, "Fecha inválida", fila)
    else if (cashOpening === null) agregarError(resultado.errores, indice, "Apertura inválida", fila)
    else if (cashClosing === null) agregarError(resultado.errores, indice, "Cierre inválido", fila)
    else {
      const key = date.toISOString().split("T")[0]
      const grupo = grupos.get(key) ?? {
        indice,
        date,
        cashOpening,
        cashClosing,
        expenses: [],
        denominations: [],
      }

      const desc = campo(fila, ["descripcionGasto", "descripcion gasto", "descripción gasto"])
      const amount = montoCampo(fila, ["montoGasto", "monto gasto"])
      if (desc && amount !== null) grupo.expenses.push({ desc, amount })

      const bill = campo(fila, ["denominacion", "denominación"])
      const quantityRaw = campo(fila, ["cantidad"])
      const quantity = Number(quantityRaw)
      if (bill && Number.isFinite(quantity) && quantity > 0) grupo.denominations.push({ bill, quantity })

      grupos.set(key, grupo)
    }
  })

  resultado.ok = Array.from(grupos.values()).map(({ indice, ...data }) => ({ indice, data }))
  return resultado
}
