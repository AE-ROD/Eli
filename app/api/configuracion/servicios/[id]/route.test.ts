import { describe, it, expect, vi, beforeEach } from "vitest"
import { Prisma } from "@prisma/client"
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

describe("DELETE /api/configuracion/servicios/[id] — servicio con comisiones", () => {
  beforeEach(() => vi.clearAllMocks())

  it("si la base lo impide por las comisiones configuradas (P2003), responde 409 con cómo seguir", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)
    prismaMock.service.findFirst.mockResolvedValueOnce({ id: "srv-1", businessId: "negocio-1" })
    prismaMock.service.delete.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Foreign key constraint violated", {
        code: "P2003",
        clientVersion: "test",
      })
    )

    const res = await DELETE(pedidoFalso(undefined), paramsCon("srv-1"))

    expect(res.status).toBe(409)
    const cuerpo = await res.json()
    expect(cuerpo.error).toContain("comisiones configuradas")
    expect(cuerpo.error).toContain("Desactívalo")
  })

  it("cualquier otro error de la base no se disfraza de 409", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)
    prismaMock.service.findFirst.mockResolvedValueOnce({ id: "srv-1", businessId: "negocio-1" })
    const otroError = new Prisma.PrismaClientKnownRequestError("Record not found", {
      code: "P2025",
      clientVersion: "test",
    })
    prismaMock.service.delete.mockRejectedValueOnce(otroError)

    await expect(DELETE(pedidoFalso(undefined), paramsCon("srv-1"))).rejects.toBe(otroError)
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

  it("la categoría se cambia y, vacía o en null, se borra", async () => {
    const { PUT } = await import("./route")

    for (const [enviada, guardada] of [["Color", "Color"], ["", null], [null, null]] as const) {
      mockGetServerSession.mockResolvedValueOnce(sesionEncargado)
      prismaMock.service.findFirst.mockResolvedValueOnce({ id: "srv-1", businessId: "negocio-1" })
      prismaMock.service.update.mockResolvedValueOnce({ id: "srv-1" })

      const res = await PUT(pedidoFalso({ category: enviada }), paramsCon("srv-1"))

      expect(res.status).toBe(200)
      expect(prismaMock.service.update.mock.calls.at(-1)![0].data.category).toBe(guardada)
    }
  })
})

describe("PUT /api/configuracion/servicios/[id] — frecuencia de visitas", () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    ["7 días", 7, 7],
    ["365 días", 365, 365],
    ["null (la borra)", null, null],
  ])("acepta %s", async (_caso, enviada, guardada) => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)
    prismaMock.service.findFirst.mockResolvedValueOnce({ id: "srv-1", businessId: "negocio-1" })
    prismaMock.service.update.mockResolvedValueOnce({ id: "srv-1" })

    const res = await PUT(pedidoFalso({ frecuenciaDias: enviada }), paramsCon("srv-1"))

    expect(res.status).toBe(200)
    expect(prismaMock.service.update.mock.calls[0][0].data.frecuenciaDias).toBe(guardada)
  })

  it.each([
    ["6 días", 6, "La frecuencia tiene que ser de al menos 7 días"],
    ["366 días", 366, "La frecuencia no puede pasar de 365 días"],
    ["21,5 días", 21.5, "La frecuencia tiene que ser un número entero de días"],
  ])("rechaza %s: 400 y no escribe", async (_caso, enviada, mensaje) => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)
    prismaMock.service.findFirst.mockResolvedValueOnce({ id: "srv-1", businessId: "negocio-1" })

    const res = await PUT(pedidoFalso({ frecuenciaDias: enviada }), paramsCon("srv-1"))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: mensaje })
    expect(prismaMock.service.update).not.toHaveBeenCalled()
  })
})

