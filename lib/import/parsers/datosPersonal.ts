import type { PrismaClient } from "@prisma/client"
import type { ResultadoParseo } from "@/lib/import/tipos"
import { matchEspecialista } from "@/lib/import/matchEspecialista"
import { normalizarNombre } from "@/lib/import/normalizar"
import { agregarError, campo, crearResultado, memberIdResuelto, type FilaParser } from "./_helpers"

export interface DatosPersonalImportado {
  memberId?: string
  emergencyContactName: string
  emergencyContactPhone: string
}

export async function parsearDatosPersonal(
  filas: FilaParser[],
  businessId: string,
  prisma: PrismaClient
): Promise<ResultadoParseo<DatosPersonalImportado>> {
  const resultado = crearResultado<DatosPersonalImportado>()

  for (const [i, fila] of filas.entries()) {
    const indice = i + 2
    const nombre = campo(fila, ["nombre", "especialista", "trabajadora"])
    const emergencyContactName = campo(fila, ["contactoEmergenciaNombre", "contacto emergencia nombre"])
    const emergencyContactPhone = campo(fila, ["contactoEmergenciaTelefono", "contacto emergencia telefono", "contacto emergencia teléfono"])
    const miembroResuelto = await memberIdResuelto(fila, businessId, prisma)

    if (!nombre && !miembroResuelto) {
      agregarError(resultado.errores, indice, "Falta nombre", fila)
      continue
    }
    if (!emergencyContactName || !emergencyContactPhone) {
      agregarError(resultado.errores, indice, "Falta contacto de emergencia", fila)
      continue
    }

    const miembro = miembroResuelto ?? (await matchEspecialista(normalizarNombre(nombre), businessId, prisma))
    if (!miembro) {
      resultado.sinMatch.push({ indice, campo: "especialista", valor: nombre, fila })
      continue
    }

    resultado.ok.push({
      indice,
      data: { memberId: miembro.id, emergencyContactName, emergencyContactPhone },
    })
  }

  return resultado
}
