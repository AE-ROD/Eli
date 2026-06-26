import type { PrismaClient } from "@prisma/client"
import { normalizarNombre } from "./normalizar"

export interface CriteriosPaciente {
  nombreNorm?: string
  telefono?: string
  email?: string
}

function normalizarTelefono(telefono: string) {
  return telefono.replace(/\D/g, "")
}

function normalizarCriterios(criterios: CriteriosPaciente | string): CriteriosPaciente {
  return typeof criterios === "string" ? { nombreNorm: criterios } : criterios
}

export async function matchPaciente(
  criteriosInput: CriteriosPaciente | string,
  businessId: string,
  prisma: PrismaClient
): Promise<{ id: string } | null> {
  const criterios = normalizarCriterios(criteriosInput)
  const nombreNorm = criterios.nombreNorm?.trim()
  const telefono = criterios.telefono ? normalizarTelefono(criterios.telefono) : ""
  const email = criterios.email?.trim().toLowerCase()

  const pacientes = await prisma.patient.findMany({
    where: { businessId },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
    },
  })

  const match = pacientes.find((paciente) => {
    const coincideNombre = nombreNorm ? normalizarNombre(paciente.name) === nombreNorm : false
    const coincideTelefono =
      telefono && paciente.phone ? normalizarTelefono(paciente.phone) === telefono : false
    const coincideEmail = email && paciente.email ? paciente.email.toLowerCase() === email : false

    return coincideNombre || coincideTelefono || coincideEmail
  })

  return match ? { id: match.id } : null
}
