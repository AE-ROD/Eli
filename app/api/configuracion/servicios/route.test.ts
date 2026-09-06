import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const prismaMock = {
  service: { findMany: vi.fn(), create: vi.fn() },
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

// Segundo negocio, sin relación con "negocio-1": si el handler hardcodeara
// businessId: "negocio-1" en el where, estos tests fallarían.
const sesionEncargadoNegocio2 = {
  user: { id: "admin-2", role: "admin", businessId: "negocio-2", businessName: "Otro negocio", memberId: "member-admin-2" },
}

const fakeRequest = (body: unknown): NextRequest =>
  ({
    headers: new Headers(),
    json: async () => body,
  }) as unknown as NextRequest

describe("GET /api/configuracion/servicios", () => {
  beforeEach(() => vi.clearAllMocks())

  it("un dueño (owner) recibe 200", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    prismaMock.service.findMany.mockResolvedValueOnce([])

    const res = await GET()

    expect(res.status).toBe(200)
  })

  it("un encargado (admin) recibe 200 y ve los servicios de su negocio", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)
    prismaMock.service.findMany.mockResolvedValueOnce([])

    const res = await GET()

    expect(res.status).toBe(200)
  })

  it("la consulta queda acotada por el businessId del actor", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargadoNegocio2)
    prismaMock.service.findMany.mockResolvedValueOnce([])

    await GET()

    const argumentos = prismaMock.service.findMany.mock.calls[0][0]
    expect(argumentos.where.businessId).toBe("negocio-2")
  })

  it("un profesional (worker) recibe 401", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await GET()

    expect(res.status).toBe(401)
    expect(prismaMock.service.findMany).not.toHaveBeenCalled()
  })

  it("sin sesión recibe 401", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await GET()

    expect(res.status).toBe(401)
  })
})

describe("POST /api/configuracion/servicios", () => {
  beforeEach(() => vi.clearAllMocks())

  const payload = { name: "Corte", duration: 30 }

  it("un dueño (owner) puede crear un servicio", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    prismaMock.service.create.mockResolvedValueOnce({ id: "srv-1", ...payload, businessId: "negocio-1" })

    const res = await POST(fakeRequest(payload))

    expect(res.status).toBe(201)
  })

  it("un encargado (admin) puede crear un servicio", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)
    prismaMock.service.create.mockResolvedValueOnce({ id: "srv-2", ...payload, businessId: "negocio-1" })

    const res = await POST(fakeRequest(payload))

    expect(res.status).toBe(201)
  })

  it("el servicio se crea con el businessId del actor, no uno hardcodeado", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargadoNegocio2)
    prismaMock.service.create.mockResolvedValueOnce({ id: "srv-3", ...payload, businessId: "negocio-2" })

    await POST(fakeRequest(payload))

    const argumentos = prismaMock.service.create.mock.calls[0][0]
    expect(argumentos.data.businessId).toBe("negocio-2")
  })

  it("un profesional (worker) recibe 401 y no llega a crear", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await POST(fakeRequest(payload))

    expect(res.status).toBe(401)
    expect(prismaMock.service.create).not.toHaveBeenCalled()
  })

  it("sin sesión recibe 401", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await POST(fakeRequest(payload))

    expect(res.status).toBe(401)
  })
})
