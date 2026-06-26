import type { PrismaClient } from "@prisma/client"
import type { ResultadoParseo } from "@/lib/import/tipos"
import { agregarError, campo, crearResultado, type FilaParser } from "./_helpers"

export interface ListaNegraImportada {
  name: string
  phone?: string
  email?: string
  notes: string
  tags: ["no-agendar"]
}

export async function parsearListaNegra(
  filas: FilaParser[],
  _businessId: string,
  _prisma: PrismaClient
): Promise<ResultadoParseo<ListaNegraImportada>> {
  const resultado = crearResultado<ListaNegraImportada>()

  filas.forEach((fila, i) => {
    const indice = i + 2
    const name = campo(fila, ["nombre", "cliente"])
    const phone = campo(fila, ["telefono", "teléfono"])
    const email = campo(fila, ["email", "correo"])
    const notes = campo(fila, ["motivo", "notas"]) || "Sin motivo registrado"

    if (!name) agregarError(resultado.errores, indice, "Falta nombre", fila)
    else resultado.ok.push({ indice, data: { name, ...(phone ? { phone } : {}), ...(email ? { email } : {}), notes, tags: ["no-agendar"] } })
  })

  return resultado
}
