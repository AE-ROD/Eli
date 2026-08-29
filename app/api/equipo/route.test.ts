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

const sesionEncargado = {
  user: { id: "admin-1", role: "admin", businessId: "negocio-1", businessName: "Mi negocio", memberId: "member-admin-1" },
}

const sesionProfesional = {
  user: { id: "worker-1", role: "worker", businessId: "negocio-1", businessName: "Mi negocio", memberId: "member-worker-1" },
}

// Segundo negocio, sin relación con "negocio-1": si un handler hardcodeara
// businessId: "negocio-1" en vez de leerlo del actor, estos tests fallarían.
const sesionEncargadoNegocio2 = {
  user: { id: "admin-2", role: "admin", businessId: "negocio-2", businessName: "Otro negocio", memberId: "member-admin-2" },
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

  it("un encargado (admin) recibe 200 y ve los datos de su negocio", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)
    prismaMock.businessMember.findMany.mockResolvedValueOnce([])
    prismaMock.workerInvitation.findMany.mockResolvedValueOnce([])

    const res = await GET()

    expect(res.status).toBe(200)
  })

  it("las dos consultas quedan acotadas por el businessId del actor", async () => {
    const { GET } = await import("./route")

    // Sesión de un negocio distinto al resto del archivo: si el handler
    // hardcodeara "negocio-1" en el where, esta aserción lo detectaría.
    mockGetServerSession.mockResolvedValueOnce(sesionEncargadoNegocio2)
    prismaMock.businessMember.findMany.mockResolvedValueOnce([])
    prismaMock.workerInvitation.findMany.mockResolvedValueOnce([])

    await GET()

    const argumentosMiembros = prismaMock.businessMember.findMany.mock.calls[0][0]
    const argumentosInvitaciones = prismaMock.workerInvitation.findMany.mock.calls[0][0]

    expect(argumentosMiembros.where.businessId).toBe("negocio-2")
    expect(argumentosInvitaciones.where.businessId).toBe("negocio-2")
  })

  it("un profesional (worker) recibe 401", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await GET()

    expect(res.status).toBe(401)
    expect(prismaMock.businessMember.findMany).not.toHaveBeenCalled()
  })

  it("sin sesión recibe 401", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await GET()

    expect(res.status).toBe(401)
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

  it("un encargado (admin) puede invitar", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)
    prismaMock.user.findFirst.mockResolvedValueOnce(null)
    prismaMock.workerInvitation.findFirst.mockResolvedValueOnce(null)
    prismaMock.workerInvitation.create.mockResolvedValueOnce({
      id: "inv-3",
      name: "Ana",
      email: "ana@x.com",
      role: "worker",
      expiresAt: new Date(),
      createdAt: new Date(),
      token: "token-secreto",
    })
    prismaMock.business.findUnique.mockResolvedValueOnce({ name: "Mi negocio" })

    const res = await POST(fakeRequest({ nombre: "Ana", email: "ana@x.com", rol: "worker" }))

    expect(res.status).toBe(201)
  })

  it("las cuatro consultas quedan acotadas por el businessId del actor", async () => {
    const { POST } = await import("./route")

    // Mismo criterio que en el GET: negocio distinto al resto del archivo
    // para que un businessId hardcodeado se note.
    mockGetServerSession.mockResolvedValueOnce(sesionEncargadoNegocio2)
    prismaMock.user.findFirst.mockResolvedValueOnce(null)
    prismaMock.workerInvitation.findFirst.mockResolvedValueOnce(null)
    prismaMock.workerInvitation.create.mockResolvedValueOnce({
      id: "inv-4",
      name: "Ana",
      email: "ana@x.com",
      role: "worker",
      expiresAt: new Date(),
      createdAt: new Date(),
      token: "token-secreto",
    })
    prismaMock.business.findUnique.mockResolvedValueOnce({ name: "Otro negocio" })

    const res = await POST(fakeRequest({ nombre: "Ana", email: "ana@x.com", rol: "worker" }))
    expect(res.status).toBe(201)

    const argumentosUsuario = prismaMock.user.findFirst.mock.calls[0][0]
    const argumentosInvitacionPendiente = prismaMock.workerInvitation.findFirst.mock.calls[0][0]
    const argumentosCrear = prismaMock.workerInvitation.create.mock.calls[0][0]
    const argumentosNegocio = prismaMock.business.findUnique.mock.calls[0][0]

    expect(argumentosUsuario.include.memberships.where.businessId).toBe("negocio-2")
    expect(argumentosInvitacionPendiente.where.businessId).toBe("negocio-2")
    expect(argumentosCrear.data.businessId).toBe("negocio-2")
    expect(argumentosNegocio.where.id).toBe("negocio-2")
  })

  it("un profesional (worker) recibe 401 y no llega a invitar", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await POST(fakeRequest({ nombre: "Ana", email: "ana@x.com", rol: "worker" }))

    expect(res.status).toBe(401)
    expect(prismaMock.workerInvitation.create).not.toHaveBeenCalled()
  })

  it("sin sesión recibe 401", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await POST(fakeRequest({ nombre: "Ana", email: "ana@x.com", rol: "worker" }))

    expect(res.status).toBe(401)
  })
})
