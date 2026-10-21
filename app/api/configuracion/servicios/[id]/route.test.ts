import { describe, it, expect, vi, beforeEach } from "vitest"
import { pedidoFalso } from "@/pruebas/pedidos"

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

const paramsCon = (id: string) => ({ params: Promise.resolve({ id }) })

describe("PUT /api/configuracion/servicios/[id]", () => {
  beforeEach(() => vi.clearAllMocks())

  it("un encargado (admin) puede editar un servicio de su negocio", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)
    prismaMock.service.findFirst.mockResolvedValueOnce({ id: "srv-1", businessId: "negocio-1" })
    prismaMock.service.update.mockResolvedValueOnce({ id: "srv-1", name: "Nuevo nombre" })

    const res = await PUT(pedidoFalso({ name: "Nuevo nombre" }), paramsCon("srv-1"))

    expect(res.status).toBe(200)
  })

  it("la búsqueda de pertenencia queda acotada por el businessId del actor", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargadoNegocio2)
    prismaMock.service.findFirst.mockResolvedValueOnce(null)

    await PUT(pedidoFalso({ name: "x" }), paramsCon("srv-1"))

    const argumentos = prismaMock.service.findFirst.mock.calls[0][0]
    expect(argumentos.where.businessId).toBe("negocio-2")
  })

  it("un servicio de otro negocio da 404, nunca 403", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargadoNegocio2)
    // El servicio "srv-1" es de negocio-1: el where con businessId: "negocio-2"
    // nunca lo encuentra, así que Prisma devuelve null.
    prismaMock.service.findFirst.mockResolvedValueOnce(null)

    const res = await PUT(pedidoFalso({ name: "x" }), paramsCon("srv-1"))

    expect(res.status).toBe(404)
    expect(prismaMock.service.update).not.toHaveBeenCalled()
  })

  it("un profesional (worker) recibe 401 y no llega a editar", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await PUT(pedidoFalso({ name: "x" }), paramsCon("srv-1"))

    expect(res.status).toBe(401)
    expect(prismaMock.service.findFirst).not.toHaveBeenCalled()
  })

  it("sin sesión recibe 401", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await PUT(pedidoFalso({ name: "x" }), paramsCon("srv-1"))

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

    const res = await DELETE(pedidoFalso(undefined), paramsCon("srv-1"))

    expect(res.status).toBe(200)
  })

  it("un servicio de otro negocio da 404, nunca 403", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargadoNegocio2)
    prismaMock.service.findFirst.mockResolvedValueOnce(null)

    const res = await DELETE(pedidoFalso(undefined), paramsCon("srv-1"))

    expect(res.status).toBe(404)
    expect(prismaMock.service.delete).not.toHaveBeenCalled()
  })

  it("un profesional (worker) recibe 401 y no llega a borrar", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await DELETE(pedidoFalso(undefined), paramsCon("srv-1"))

    expect(res.status).toBe(401)
    expect(prismaMock.service.findFirst).not.toHaveBeenCalled()
  })

  it("sin sesión recibe 401", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await DELETE(pedidoFalso(undefined), paramsCon("srv-1"))

    expect(res.status).toBe(401)
  })
})

describe("PUT /api/configuracion/servicios/[id] — largos y tipos", () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    ["un nombre de 101 caracteres", { name: "a".repeat(101) }, "El nombre no puede tener más de 100 caracteres"],
    ["una descripción de 2001 caracteres", { description: "a".repeat(2001) }, "La descripción no puede tener más de 2000 caracteres"],
    ["una duración de 2.5 minutos", { duration: 2.5 }, "La duración tiene que ser un número entero de minutos"],
    ["un precio de más de 10.000.000", { price: 10_000_001 }, "El precio no puede ser mayor que 10.000.000"],
    ["un precio negativo", { price: -1 }, "El precio no puede ser negativo"],
    ["una duración de 14 minutos", { duration: 14 }, "La duración tiene que ser de al menos 15 minutos"],
  ])("rechaza %s: 400 con un error legible, sin `detalles`, y no escribe", async (_caso, cuerpo, mensaje) => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)
    prismaMock.service.findFirst.mockResolvedValueOnce({ id: "srv-1", businessId: "negocio-1" })

    const res = await PUT(pedidoFalso(cuerpo), paramsCon("srv-1"))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: mensaje })
    expect(prismaMock.service.update).not.toHaveBeenCalled()
  })

  it("un precio de 0 es válido: un servicio gratis", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)
    prismaMock.service.findFirst.mockResolvedValueOnce({ id: "srv-1", businessId: "negocio-1" })
    prismaMock.service.update.mockResolvedValueOnce({ id: "srv-1", price: 0 })

    const res = await PUT(pedidoFalso({ price: 0, duration: 15 }), paramsCon("srv-1"))

    expect(res.status).toBe(200)
    expect(prismaMock.service.update.mock.calls[0][0].data).toMatchObject({ price: 0, duration: 15 })
  })

  it("el precio en null sigue siendo \"sin precio\"", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)
    prismaMock.service.findFirst.mockResolvedValueOnce({ id: "srv-1", businessId: "negocio-1" })
    prismaMock.service.update.mockResolvedValueOnce({ id: "srv-1", price: null })

    const res = await PUT(pedidoFalso({ price: null, description: null }), paramsCon("srv-1"))

    expect(res.status).toBe(200)
  })
})
