import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    businessMember: { findMany: vi.fn() },
  },
}))

import { getServerSession } from "next-auth"
import { GET } from "@/app/api/imports/miembros/route"
import { prisma } from "@/lib/prisma"

describe("GET /api/imports/miembros", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("responde 401 cuando no hay sesión", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null)

    const response = await GET()

    expect(response.status).toBe(401)
    expect(prisma.businessMember.findMany).not.toHaveBeenCalled()
  })

  it("retorna solo miembros del negocio de la sesión", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", businessId: "biz-1" },
    } as never)
    vi.mocked(prisma.businessMember.findMany).mockResolvedValue([
      { id: "member-1", user: { name: "Ana López" } },
      { id: "member-2", user: { name: "Bruno Díaz" } },
    ] as never)

    const response = await GET()

    expect(response.status).toBe(200)
    expect(prisma.businessMember.findMany).toHaveBeenCalledWith({
      where: { businessId: "biz-1" },
      select: { id: true, user: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    })
    await expect(response.json()).resolves.toEqual({
      miembros: [
        { id: "member-1", nombre: "Ana López" },
        { id: "member-2", nombre: "Bruno Díaz" },
      ],
    })
  })
})
