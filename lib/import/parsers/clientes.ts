import type { PrismaClient } from "@prisma/client"
import type { ResultadoParseo } from "@/lib/import/tipos"
import { matchEspecialista } from "@/lib/import/matchEspecialista"
import { normalizarNombre } from "@/lib/import/normalizar"
import { agregarError, campo, crearResultado, fechaCampo, tieneFormulaRota, type FilaParser } from "./_helpers"

export interface ClienteAgendaImportado {
  patientName: string
  phone?: string
  email?: string
  appointmentDate: Date
  memberId?: string
}

export async function parsearClientes(
  filas: FilaParser[],
  businessId: string,
  prisma: PrismaClient
): Promise<ResultadoParseo<ClienteAgendaImportado>> {
  const resultado = crearResultado<ClienteAgendaImportado>()

  for (const [i, fila] of filas.entries()) {
    const indice = i + 2
    if (tieneFormulaRota(fila)) {
      agregarError(resultado.errores, indice, "Fila contiene fórmula rota", fila)
      continue
    }

    const patientName = campo(fila, ["nombre", "cliente"])
    const especialista = campo(fila, ["especialista", "trabajadora"])
    const appointmentDate = fechaCampo(fila, ["fecha"])
    const phone = campo(fila, ["telefono", "teléfono"])
    const email = campo(fila, ["email", "correo"])

    if (!patientName) {
      agregarError(resultado.errores, indice, "Falta nombre del cliente", fila)
      continue
    }
    if (!appointmentDate) {
      agregarError(resultado.errores, indice, "Fecha inválida", fila)
      continue
    }

    const miembro = especialista
      ? await matchEspecialista(normalizarNombre(especialista), businessId, prisma)
      : null
    if (especialista && !miembro) {
      resultado.sinMatch.push({ indice, campo: "especialista", valor: especialista, fila })
      continue
    }

    resultado.ok.push({
      indice,
      data: {
        patientName,
        ...(phone ? { phone } : {}),
        ...(email ? { email } : {}),
        appointmentDate,
        ...(miembro ? { memberId: miembro.id } : {}),
      },
    })
  }

  return resultado
}
