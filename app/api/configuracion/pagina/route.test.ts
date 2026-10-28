import { describe, it, expect, vi, beforeEach } from "vitest"
import { pedidoFalso, cuerpoDePrueba } from "@/pruebas/pedidos"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const prismaMock = {
  business: { update: vi.fn() },
  businessMember: { findMany: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn(),
}

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

const sesion = (role: string, businessId = "negocio-1", memberId: string | null = `member-${role}`) => ({
  user: { id: `${role}-1`, role, businessId, memberId },
})

const PAGINA = {
  address: "  Av. Providencia 1234  ",
  comuna: "Providencia",
  whatsapp: "9 1234 5678",
  instagram: "https://www.instagram.com/Salon.Ana/",
  color: "menta",
  mediosDePago: ["efectivo", "transferencia", "efectivo"],
  especialidades: [{ memberId: "m-1", especialidad: "Colorista" }],
}

beforeEach(() => {
  vi.clearAllMocks()
  prismaMock.business.update.mockImplementation(async ({ data }) => data)
  prismaMock.businessMember.updateMany.mockResolvedValue({ count: 1 })
  prismaMock.$transaction.mockImplementation(async (operaciones: Promise<unknown>[]) => Promise.all(operaciones))
})

describe("PUT /api/configuracion/pagina", () => {
  it("el dueño guarda la página normalizada sobre su propio negocio", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesion("owner", "negocio-1", null))
    prismaMock.businessMember.findMany.mockResolvedValueOnce([{ id: "m-1" }])

    const respuesta = await PUT(pedidoFalso(PAGINA))

    expect(respuesta.status).toBe(200)
    const argumentos = prismaMock.business.update.mock.calls[0][0]
    expect(argumentos.where).toEqual({ id: "negocio-1" })
    expect(argumentos.data).toEqual({
      address: "Av. Providencia 1234",
      comuna: "Providencia",
      whatsapp: "+56912345678",
      instagram: "salon.ana",
      color: "menta",
      mediosDePago: ["efectivo", "transferencia"],
    })
    expect(prismaMock.businessMember.updateMany).toHaveBeenCalledWith({
      where: { id: "m-1", businessId: "negocio-1" },
      data: { especialidad: "Colorista" },
    })
  })

  it("el encargado también puede", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesion("admin"))
    prismaMock.businessMember.findMany.mockResolvedValueOnce([{ id: "m-1" }])

    expect((await PUT(pedidoFalso(PAGINA))).status).toBe(200)
  })

  it("el profesional recibe 401 y no se escribe nada", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesion("worker"))

    const respuesta = await PUT(pedidoFalso(PAGINA))

    expect(respuesta.status).toBe(401)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(prismaMock.business.update).not.toHaveBeenCalled()
  })

  it("sin sesión, 401", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(null)

    expect((await PUT(pedidoFalso(PAGINA))).status).toBe(401)
  })

  it("un miembro de otro negocio da 404 y no se guarda nada", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesion("owner", "negocio-2", null))
    // m-1 es de negocio-1: la búsqueda acotada a negocio-2 no lo encuentra.
    prismaMock.businessMember.findMany.mockResolvedValueOnce([])

    const respuesta = await PUT(pedidoFalso(PAGINA))

    expect(respuesta.status).toBe(404)
    expect(prismaMock.businessMember.findMany.mock.calls[0][0].where).toEqual({
      id: { in: ["m-1"] },
      businessId: "negocio-2",
    })
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("los campos vacíos se borran (null) y sin especialidades no consulta miembros", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesion("owner", "negocio-1", null))

    const respuesta = await PUT(
      pedidoFalso({ address: "", comuna: " ", whatsapp: "", instagram: "", color: "noche", mediosDePago: [], especialidades: [] })
    )

    expect(respuesta.status).toBe(200)
    expect(prismaMock.businessMember.findMany).not.toHaveBeenCalled()
    expect(prismaMock.business.update.mock.calls[0][0].data).toEqual({
      address: null,
      comuna: null,
      whatsapp: null,
      instagram: null,
      color: "noche",
      mediosDePago: [],
    })
  })

  it.each([
    ["un color fuera de la paleta", { color: "fucsia" }, "Elige uno de los colores"],
    ["un medio de pago desconocido", { mediosDePago: ["cheque"] }, "no está en la lista"],
    ["un Instagram de otro sitio", { instagram: "https://evil.com/x" }, "No pudimos leer el Instagram"],
    ["un WhatsApp que no es chileno", { whatsapp: "+1 555 0100" }, "No pudimos leer el teléfono"],
    ["una dirección demasiado larga", { address: "a".repeat(201) }, "La dirección no puede tener más de 200"],
    ["un profesional repetido", { especialidades: [{ memberId: "m-1", especialidad: "a" }, { memberId: "m-1", especialidad: "b" }] }, "dos veces"],
  ])("rechaza %s con 400 y un mensaje claro", async (_que, cambio, mensaje) => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesion("owner", "negocio-1", null))

    const respuesta = await PUT(pedidoFalso({ ...PAGINA, ...cambio }))

    expect(respuesta.status).toBe(400)
    expect((await respuesta.json()).error).toContain(mensaje)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("un cuerpo que no es JSON da 400, no 500", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesion("owner", "negocio-1", null))
    const roto = { headers: new Headers(), body: cuerpoDePrueba("{no es json") }

    const respuesta = await PUT(roto as never)

    expect(respuesta.status).toBe(400)
  })

  it("un businessId en el cuerpo no cambia el negocio sobre el que se escribe", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesion("owner", "negocio-1", null))
    prismaMock.businessMember.findMany.mockResolvedValueOnce([{ id: "m-1" }])

    await PUT(pedidoFalso({ ...PAGINA, businessId: "negocio-2", id: "negocio-2" }))

    const argumentos = prismaMock.business.update.mock.calls[0][0]
    expect(argumentos.where).toEqual({ id: "negocio-1" })
    expect(argumentos.data).not.toHaveProperty("businessId")
    expect(argumentos.data).not.toHaveProperty("id")
  })
})
