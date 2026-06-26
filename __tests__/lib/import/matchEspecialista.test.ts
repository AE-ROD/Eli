import { describe, expect, it, vi } from "vitest"
import type { PrismaClient } from "@prisma/client"
import { matchEspecialista } from "@/lib/import/matchEspecialista"
import { normalizarNombre } from "@/lib/import/normalizar"

function prismaMock(miembros: Array<{ id: string; businessId: string; user: { name: string } }>) {
  return {
    businessMember: {
      findMany: vi.fn(({ where }: { where: { businessId: string } }) =>
        Promise.resolve(miembros.filter((miembro) => miembro.businessId === where.businessId))
      ),
    },
  } as unknown as PrismaClient
}

describe("matchEspecialista", () => {
  it("encuentra match exacto por nombre normalizado", async () => {
    const prisma = prismaMock([
      { id: "member-1", businessId: "biz-1", user: { name: "María Pérez" } },
    ])

    await expect(matchEspecialista(normalizarNombre("Maria Perez"), "biz-1", prisma)).resolves.toEqual({
      id: "member-1",
    })
  })

  it("devuelve null cuando no hay match", async () => {
    const prisma = prismaMock([
      { id: "member-1", businessId: "biz-1", user: { name: "María Pérez" } },
    ])

    await expect(matchEspecialista(normalizarNombre("Ana Soto"), "biz-1", prisma)).resolves.toBeNull()
  })

  it("respeta aislamiento por negocio cuando hay nombres repetidos", async () => {
    const prisma = prismaMock([
      { id: "member-a", businessId: "biz-a", user: { name: "Camila Ruiz" } },
      { id: "member-b", businessId: "biz-b", user: { name: "Camila Ruiz" } },
    ])

    await expect(matchEspecialista(normalizarNombre("Camila Ruiz"), "biz-a", prisma)).resolves.toEqual({
      id: "member-a",
    })
  })
})
