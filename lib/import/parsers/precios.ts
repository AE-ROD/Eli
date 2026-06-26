import type { PrismaClient } from "@prisma/client"
import type { ResultadoParseo } from "@/lib/import/tipos"
import { agregarError, campo, crearResultado, montoCampo, numeroPositivoCampo, type FilaParser } from "./_helpers"

export interface PrecioImportado {
  name: string
  price: number
  duration: number
}

export async function parsearPrecios(
  filas: FilaParser[],
  _businessId: string,
  _prisma: PrismaClient
): Promise<ResultadoParseo<PrecioImportado>> {
  const resultado = crearResultado<PrecioImportado>()

  filas.forEach((fila, i) => {
    const indice = i + 2
    const name = campo(fila, ["nombre", "nombre servicio", "servicio"])
    const price = montoCampo(fila, ["precio"])
    const duration = numeroPositivoCampo(fila, ["duracion", "duración"])

    if (!name) agregarError(resultado.errores, indice, "Falta nombre del servicio", fila)
    else if (price === null) agregarError(resultado.errores, indice, "Precio inválido", fila)
    else if (duration === null) agregarError(resultado.errores, indice, "Duración inválida", fila)
    else resultado.ok.push({ indice, data: { name, price, duration } })
  })

  return resultado
}
