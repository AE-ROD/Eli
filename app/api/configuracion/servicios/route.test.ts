import { describe, it, expect, vi, beforeEach } from "vitest"
import { pedidoFalso } from "@/pruebas/pedidos"

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

    const res = await POST(pedidoFalso(payload))

    expect(res.status).toBe(201)
  })

  it("un encargado (admin) puede crear un servicio", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)
    prismaMock.service.create.mockResolvedValueOnce({ id: "srv-2", ...payload, businessId: "negocio-1" })

    const res = await POST(pedidoFalso(payload))

    expect(res.status).toBe(201)
  })

  it("el servicio se crea con el businessId del actor, no uno hardcodeado", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargadoNegocio2)
    prismaMock.service.create.mockResolvedValueOnce({ id: "srv-3", ...payload, businessId: "negocio-2" })

    await POST(pedidoFalso(payload))

    const argumentos = prismaMock.service.create.mock.calls[0][0]
    expect(argumentos.data.businessId).toBe("negocio-2")
  })

  it("un profesional (worker) recibe 401 y no llega a crear", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await POST(pedidoFalso(payload))

    expect(res.status).toBe(401)
    expect(prismaMock.service.create).not.toHaveBeenCalled()
  })

  it("sin sesión recibe 401", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await POST(pedidoFalso(payload))

    expect(res.status).toBe(401)
  })
})

describe("POST /api/configuracion/servicios — largos y tipos", () => {
  beforeEach(() => vi.clearAllMocks())

  const valido = { name: "Corte", duration: 30 }

  it.each([
    ["un nombre de 101 caracteres", { name: "a".repeat(101) }, "El nombre no puede tener más de 100 caracteres"],
    ["una descripción de 2001 caracteres", { description: "a".repeat(2001) }, "La descripción no puede tener más de 2000 caracteres"],
    ["una duración de 2.5 minutos", { duration: 2.5 }, "La duración tiene que ser un número entero de minutos"],
    ["una duración de 4 minutos", { duration: 4 }, "La duración tiene que ser de al menos 5 minutos"],
    ["una duración de 481 minutos", { duration: 481 }, "La duración no puede pasar de 480 minutos"],
    ["un precio de 0", { price: 0 }, "El precio tiene que ser mayor que 0"],
    ["un precio de más de 10.000.000", { price: 10_000_001 }, "El precio no puede ser mayor que 10.000.000"],
    ["una duración que no es número", { duration: "30" }, "Datos inválidos"],
  ])("rechaza %s: 400 con un error legible, sin `detalles`, y no crea nada", async (_caso, campos, mensaje) => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const res = await POST(pedidoFalso({ ...valido, ...campos }))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: mensaje })
    expect(prismaMock.service.create).not.toHaveBeenCalled()
  })

  it.each([
    ["duración de 5", { duration: 5 }],
    ["duración de 480", { duration: 480 }],
    ["precio de 10.000.000", { price: 10_000_000 }],
    ["nombre de 100 y descripción de 2000", { name: "a".repeat(100), description: "a".repeat(2000) }],
  ])("acepta el borde: %s", async (_caso, campos) => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    prismaMock.service.create.mockResolvedValueOnce({ id: "srv-1" })

    const res = await POST(pedidoFalso({ ...valido, ...campos }))

    expect(res.status).toBe(201)
  })
})
