import type { PrismaClient } from "@prisma/client"
import type { ResultadoParseo } from "@/lib/import/tipos"
import { agregarError, campo, crearResultado, montoCampo, type FilaParser } from "./_helpers"

export interface EmpleadaDeclaradaImportada {
  trabajadora: string
  periodo: string
  monto: number
}

export async function parsearEmpleadas(
  filas: FilaParser[],
  _businessId: string,
  _prisma: PrismaClient
): Promise<ResultadoParseo<EmpleadaDeclaradaImportada>> {
  const resultado = crearResultado<EmpleadaDeclaradaImportada>()

  filas.forEach((fila, i) => {
    const indice = i + 2
    const trabajadora = campo(fila, ["trabajadora", "empleada"])
    const periodo = campo(fila, ["periodo", "período"])
    const monto = montoCampo(fila, ["monto", "total"])

    if (!trabajadora) agregarError(resultado.errores, indice, "Falta trabajadora", fila)
    else if (!periodo) agregarError(resultado.errores, indice, "Falta periodo", fila)
    else if (monto === null) agregarError(resultado.errores, indice, "Monto inválido", fila)
    else resultado.ok.push({ indice, data: { trabajadora, periodo, monto } })
  })

  return resultado
}
