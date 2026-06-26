import { describe, expect, it, vi } from "vitest"
import type { PrismaClient } from "@prisma/client"
import { matchPaciente } from "@/lib/import/matchPaciente"
import { normalizarNombre } from "@/lib/import/normalizar"

interface PacienteMock {
  id: string
  businessId: string
  name: string
  phone: string | null
  email: string | null
}

function prismaMock(pacientes: PacienteMock[]) {
  return {
    patient: {
      findMany: vi.fn(({ where }: { where: { businessId: string } }) =>
        Promise.resolve(pacientes.filter((paciente) => paciente.businessId === where.businessId))
      ),
    },
  } as unknown as PrismaClient
}

describe("matchPaciente", () => {
  it("encuentra match por nombre normalizado", async () => {
    const prisma = prismaMock([
      { id: "patient-1", businessId: "biz-1", name: "José Rojas", phone: null, email: null },
    ])

    await expect(matchPaciente(normalizarNombre("Jose Rojas"), "biz-1", prisma)).resolves.toEqual({
      id: "patient-1",
    })
  })

  it("encuentra match por teléfono", async () => {
    const prisma = prismaMock([
      { id: "patient-1", businessId: "biz-1", name: "Cliente", phone: "+56 9 1234 5678", email: null },
    ])

    await expect(matchPaciente({ telefono: "56912345678" }, "biz-1", prisma)).resolves.toEqual({
      id: "patient-1",
    })
  })

  it("devuelve null cuando no hay match", async () => {
    const prisma = prismaMock([
      { id: "patient-1", businessId: "biz-1", name: "Cliente", phone: null, email: null },
    ])

    await expect(matchPaciente(normalizarNombre("Otra Persona"), "biz-1", prisma)).resolves.toBeNull()
  })

  it("respeta aislamiento cross-business", async () => {
    const prisma = prismaMock([
      { id: "patient-a", businessId: "biz-a", name: "Laura Díaz", phone: "+56 9 1111 1111", email: "a@test.com" },
      { id: "patient-b", businessId: "biz-b", name: "Laura Díaz", phone: "+56 9 1111 1111", email: "b@test.com" },
    ])

    await expect(matchPaciente(normalizarNombre("Laura Diaz"), "biz-a", prisma)).resolves.toEqual({
      id: "patient-a",
    })
  })
})
