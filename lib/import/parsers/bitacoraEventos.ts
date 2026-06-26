import type { PrismaClient } from "@prisma/client"
import type { ResultadoParseo } from "@/lib/import/tipos"
import { matchEspecialista } from "@/lib/import/matchEspecialista"
import { normalizarNombre } from "@/lib/import/normalizar"
import { agregarError, campo, crearResultado, fechaCampo, montoCampo, type FilaParser } from "./_helpers"

export type BitacoraEventoImportado =
  | { tipo: "produccion"; memberId?: string; amount: number; date: Date }
  | { tipo: "noshow"; patientName: string; phone?: string; date: Date }

export async function parsearBitacoraEventos(
  filas: FilaParser[],
  businessId: string,
  prisma: PrismaClient
): Promise<ResultadoParseo<BitacoraEventoImportado>> {
  const resultado = crearResultado<BitacoraEventoImportado>()

  for (const [i, fila] of filas.entries()) {
    const indice = i + 2
    const tipoRaw = campo(fila, ["tipo", "evento"]).toLowerCase()
    const date = fechaCampo(fila, ["fecha"])
    if (!date) {
      agregarError(resultado.errores, indice, "Fecha inválida", fila)
      continue
    }

    if (tipoRaw.includes("no")) {
      const patientName = campo(fila, ["nombre", "cliente", "paciente"])
      if (!patientName) agregarError(resultado.errores, indice, "Falta cliente", fila)
      else {
        const phone = campo(fila, ["telefono", "teléfono"])
        resultado.ok.push({ indice, data: { tipo: "noshow", patientName, ...(phone ? { phone } : {}), date } })
      }
      continue
    }

    const trabajadora = campo(fila, ["trabajadora", "especialista"])
    const amount = montoCampo(fila, ["monto", "produccion", "producción"])
    if (!trabajadora) {
      agregarError(resultado.errores, indice, "Falta trabajadora", fila)
      continue
    }
    if (amount === null) {
      agregarError(resultado.errores, indice, "Monto inválido", fila)
      continue
    }

    const miembro = await matchEspecialista(normalizarNombre(trabajadora), businessId, prisma)
    if (!miembro) {
      resultado.sinMatch.push({ indice, campo: "especialista", valor: trabajadora, fila })
      continue
    }

    resultado.ok.push({ indice, data: { tipo: "produccion", memberId: miembro.id, amount, date } })
  }

  return resultado
}
