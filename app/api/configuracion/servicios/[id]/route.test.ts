import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const prismaMock = {
  service: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
}

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

const sesionEncargado = {
  user: { id: "admin-1", role: "admin", businessId: "negocio-1", businessName: "Mi negocio", memberId: "member-admin-1" },
}

const sesionProfesional = {
  user: { id: "worker-1", role: "worker", businessId: "negocio-1", businessName: "Mi negocio", memberId: "member-worker-1" },
}

// Encargado de otro negocio: usado para probar que un servicio de "negocio-1"
// nunca es alcanzable desde "negocio-2".
const sesionEncargadoNegocio2 = {
  user: { id: "admin-2", role: "admin", businessId: "negocio-2", businessName: "Otro negocio", memberId: "member-admin-2" },
}

const fakeRequest = (body: unknown): NextRequest =>
  ({
    headers: new Headers(),
    json: async () => body,
  }) as unknown as NextRequest

const paramsCon = (id: string) => ({ params: Promise.resolve({ id }) })

describe("PUT /api/configuracion/servicios/[id]", () => {
  beforeEach(() => vi.clearAllMocks())

  it("un encargado (admin) puede editar un servicio de su negocio", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)
    prismaMock.service.findFirst.mockResolvedValueOnce({ id: "srv-1", businessId: "negocio-1" })
    prismaMock.service.update.mockResolvedValueOnce({ id: "srv-1", name: "Nuevo nombre" })

    const res = await PUT(fakeRequest({ name: "Nuevo nombre" }), paramsCon("srv-1"))

    expect(res.status).toBe(200)
  })

  it("la búsqueda de pertenencia queda acotada por el businessId del actor", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargadoNegocio2)
    prismaMock.service.findFirst.mockResolvedValueOnce(null)

    await PUT(fakeRequest({ name: "x" }), paramsCon("srv-1"))

    const argumentos = prismaMock.service.findFirst.mock.calls[0][0]
    expect(argumentos.where.businessId).toBe("negocio-2")
  })

  it("un servicio de otro negocio da 404, nunca 403", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargadoNegocio2)
    // El servicio "srv-1" es de negocio-1: el where con businessId: "negocio-2"
    // nunca lo encuentra, así que Prisma devuelve null.
    prismaMock.service.findFirst.mockResolvedValueOnce(null)

    const res = await PUT(fakeRequest({ name: "x" }), paramsCon("srv-1"))

    expect(res.status).toBe(404)
    expect(prismaMock.service.update).not.toHaveBeenCalled()
  })

  it("un profesional (worker) recibe 401 y no llega a editar", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await PUT(fakeRequest({ name: "x" }), paramsCon("srv-1"))

    expect(res.status).toBe(401)
    expect(prismaMock.service.findFirst).not.toHaveBeenCalled()
  })

  it("sin sesión recibe 401", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await PUT(fakeRequest({ name: "x" }), paramsCon("srv-1"))

    expect(res.status).toBe(401)
  })
})

describe("DELETE /api/configuracion/servicios/[id]", () => {
  beforeEach(() => vi.clearAllMocks())

  it("un encargado (admin) puede borrar un servicio de su negocio", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)
    prismaMock.service.findFirst.mockResolvedValueOnce({ id: "srv-1", businessId: "negocio-1" })
    prismaMock.service.delete.mockResolvedValueOnce({ id: "srv-1" })

    const res = await DELETE(fakeRequest(undefined), paramsCon("srv-1"))

    expect(res.status).toBe(200)
  })

  it("un servicio de otro negocio da 404, nunca 403", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargadoNegocio2)
    prismaMock.service.findFirst.mockResolvedValueOnce(null)

    const res = await DELETE(fakeRequest(undefined), paramsCon("srv-1"))

    expect(res.status).toBe(404)
    expect(prismaMock.service.delete).not.toHaveBeenCalled()
  })

  it("un profesional (worker) recibe 401 y no llega a borrar", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await DELETE(fakeRequest(undefined), paramsCon("srv-1"))

    expect(res.status).toBe(401)
    expect(prismaMock.service.findFirst).not.toHaveBeenCalled()
  })

  it("sin sesión recibe 401", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await DELETE(fakeRequest(undefined), paramsCon("srv-1"))

    expect(res.status).toBe(401)
  })
})
