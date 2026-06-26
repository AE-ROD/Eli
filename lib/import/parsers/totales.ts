import type { PrismaClient } from "@prisma/client"
import type { ResultadoParseo } from "@/lib/import/tipos"
import { agregarError, campo, crearResultado, montoCampo, type FilaParser } from "./_helpers"

export interface TotalDeclaradoImportado {
  periodo: string
  metodoPago: string
  montoDeclarado: number
}

export async function parsearTotales(
  filas: FilaParser[],
  _businessId: string,
  _prisma: PrismaClient
): Promise<ResultadoParseo<TotalDeclaradoImportado>> {
  const resultado = crearResultado<TotalDeclaradoImportado>()

  filas.forEach((fila, i) => {
    const indice = i + 2
    const periodo = campo(fila, ["periodo", "período"])
    const metodoPago = campo(fila, ["metodoPago", "métodoPago", "metodo pago", "método pago", "metodo", "método"])
    const montoDeclarado = montoCampo(fila, ["montoDeclarado", "monto declarado", "monto"])

    if (!periodo) agregarError(resultado.errores, indice, "Falta periodo", fila)
    else if (!metodoPago) agregarError(resultado.errores, indice, "Falta método de pago", fila)
    else if (montoDeclarado === null) agregarError(resultado.errores, indice, "Monto inválido", fila)
    else resultado.ok.push({ indice, data: { periodo, metodoPago, montoDeclarado } })
  })

  return resultado
}
