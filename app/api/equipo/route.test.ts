import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

vi.mock("@/lib/email", () => ({
  enviarInvitacionTrabajador: vi.fn().mockResolvedValue(undefined),
}))

const prismaMock = {
  businessMember: { findMany: vi.fn() },
  workerInvitation: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  user: { findFirst: vi.fn() },
  business: { findUnique: vi.fn() },
}

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

const sesionDueño = {
  user: { id: "owner-1", role: "owner", businessId: "negocio-1", businessName: "Mi negocio" },
}

const fakeRequest = (body: unknown): NextRequest =>
  ({
    headers: new Headers(),
    json: async () => body,
  }) as unknown as NextRequest

describe("GET /api/equipo", () => {
  beforeEach(() => vi.clearAllMocks())

  it("usa select explícito y no puede filtrar el token de una invitación", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    prismaMock.businessMember.findMany.mockResolvedValueOnce([])
    prismaMock.workerInvitation.findMany.mockResolvedValueOnce([
      { id: "inv-1", name: "Juan", email: "juan@x.com", role: "worker", expiresAt: new Date(), createdAt: new Date() },
    ])

    const res = await GET()
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.invitaciones[0]).not.toHaveProperty("token")

    // La consulta a Prisma nunca pidió el campo token.
    const argumentos = prismaMock.workerInvitation.findMany.mock.calls[0][0]
    expect(argumentos.select).toBeDefined()
    expect(argumentos.select.token).toBeUndefined()
  })
})

describe("POST /api/equipo", () => {
  beforeEach(() => vi.clearAllMocks())

  it("nunca devuelve el token de la invitación creada", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    prismaMock.user.findFirst.mockResolvedValueOnce(null)
    prismaMock.workerInvitation.findFirst.mockResolvedValueOnce(null)
    prismaMock.workerInvitation.create.mockResolvedValueOnce({
      id: "inv-2",
      name: "Ana",
      email: "ana@x.com",
      role: "worker",
      expiresAt: new Date(),
      createdAt: new Date(),
      token: "token-secreto",
    })
    prismaMock.business.findUnique.mockResolvedValueOnce({ name: "Mi negocio" })

    const res = await POST(fakeRequest({ nombre: "Ana", email: "ana@x.com", rol: "worker" }))
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data.invitacion).not.toHaveProperty("token")
    expect(JSON.stringify(data)).not.toContain("token-secreto")
  })
})
