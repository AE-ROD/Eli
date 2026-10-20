import { describe, it, expect, vi, beforeEach } from "vitest"
import { pedidoFalso } from "@/pruebas/pedidos"
import { Prisma } from "@prisma/client"
import { RUBROS } from "@/lib/rubros"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const prismaMock = {
  business: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
  },
}

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

const mockVerificarLimite = vi.fn()

vi.mock("@/lib/rate-limit", () => ({
  obtenerIp: () => "203.0.113.7",
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
}))

/** El error que lanza Prisma cuando un `@unique` choca: lo arma a mano para no depender de la base. */
function choqueDeUnico(campo: string) {
  return new Prisma.PrismaClientKnownRequestError(`Unique constraint failed on the fields: (\`${campo}\`)`, {
    code: "P2002",
    clientVersion: "test",
    meta: { target: [campo] },
  })
}

const sesion = { user: { id: "usuario-1", email: "ana@example.com" } }

describe("POST /api/auth/completar-perfil", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue(sesion)
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 4 })
    prismaMock.business.findFirst.mockResolvedValue(null)
    prismaMock.business.findUnique.mockResolvedValue(null)
    prismaMock.business.create.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "negocio-1", ...args.data })
    )
  })

  it.each(RUBROS.map((rubro) => rubro.id))("crea el negocio con el rubro %s del catálogo", async (tipoNegocio) => {
    const { POST } = await import("./route")

    const res = await POST(pedidoFalso({ nombreNegocio: "Salón María", tipoNegocio }))

    expect(res.status).toBe(200)
    expect(prismaMock.business.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: tipoNegocio, userId: "usuario-1" }),
    })
  })

  it.each(["salud", "fitness", "otro", "peluqueria-canina", ""])(
    "rechaza el rubro %j, que no está en el catálogo: 400 y no se crea el negocio",
    async (tipoNegocio) => {
      const { POST } = await import("./route")

      const res = await POST(pedidoFalso({ nombreNegocio: "Salón María", tipoNegocio }))

      expect(res.status).toBe(400)
      expect(prismaMock.business.create).not.toHaveBeenCalled()
    }
  )

  it("sin rubro tampoco crea el negocio", async () => {
    const { POST } = await import("./route")

    const res = await POST(pedidoFalso({ nombreNegocio: "Salón María" }))

    expect(res.status).toBe(400)
    expect(prismaMock.business.create).not.toHaveBeenCalled()
  })

  it("sin sesión recibe 401 y no toca la base", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await POST(pedidoFalso({ nombreNegocio: "Salón María", tipoNegocio: "salon" }))

    expect(res.status).toBe(401)
    expect(prismaMock.business.findFirst).not.toHaveBeenCalled()
    expect(prismaMock.business.create).not.toHaveBeenCalled()
  })

  it("tiene tope por usuario con el límite `auth`: pasado, 429 sin tocar la base", async () => {
    const { POST } = await import("./route")

    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })

    const res = await POST(pedidoFalso({ nombreNegocio: "Salón María", tipoNegocio: "salon" }))

    expect(res.status).toBe(429)
    expect(mockVerificarLimite).toHaveBeenCalledWith("auth", "completar-perfil:usuario-1")
    expect(prismaMock.business.findFirst).not.toHaveBeenCalled()
    expect(prismaMock.business.create).not.toHaveBeenCalled()
  })

  it("sin sesión no gasta el cupo de nadie: 401 antes del límite", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(null)

    await POST(pedidoFalso({ nombreNegocio: "Salón María", tipoNegocio: "salon" }))

    expect(mockVerificarLimite).not.toHaveBeenCalled()
  })

  it.each([
    ["un nombre de 81 caracteres", { nombreNegocio: "a".repeat(81) }],
    ["un equipo de 0", { teamSize: 0 }],
    ["un equipo de 501", { teamSize: 501 }],
    ["un equipo de 2.5", { teamSize: 2.5 }],
    ["un equipo que no es número", { teamSize: "3" }],
  ])("rechaza %s: 400 y no se crea el negocio", async (_caso, campos) => {
    const { POST } = await import("./route")

    const res = await POST(pedidoFalso({ nombreNegocio: "Salón María", tipoNegocio: "salon", ...campos }))

    expect(res.status).toBe(400)
    expect(prismaMock.business.create).not.toHaveBeenCalled()
  })

  it("acepta los bordes: nombre de 80 caracteres y equipo de 500", async () => {
    const { POST } = await import("./route")

    const res = await POST(pedidoFalso({ nombreNegocio: "a".repeat(80), tipoNegocio: "salon", teamSize: 500 }))

    expect(res.status).toBe(200)
    expect(prismaMock.business.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "a".repeat(80), teamSize: 500 }),
    })
  })

  it("un pedido simultáneo que ya creó el negocio (P2002 en userId) da 409, no 500", async () => {
    const { POST } = await import("./route")

    prismaMock.business.create.mockRejectedValueOnce(choqueDeUnico("userId"))

    const res = await POST(pedidoFalso({ nombreNegocio: "Salón María", tipoNegocio: "salon" }))

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: "Ya tienes un negocio configurado" })
  })

  it("si otro negocio se quedó con el mismo slug en el medio (P2002 en slug), también 409, con un mensaje que invita a reintentar", async () => {
    const { POST } = await import("./route")

    prismaMock.business.create.mockRejectedValueOnce(choqueDeUnico("slug"))

    const res = await POST(pedidoFalso({ nombreNegocio: "Salón María", tipoNegocio: "salon" }))

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: "No se pudo crear el negocio, intenta de nuevo" })
  })

  it("el slug sale del nombre", async () => {
    const { POST } = await import("./route")

    await POST(pedidoFalso({ nombreNegocio: "Salón María", tipoNegocio: "salon" }))

    expect(prismaMock.business.create.mock.calls[0][0].data.slug).toBe("salon-maria")
  })

  it.each(["!!!", "🙂🙂", "---", "日本の店"])(
    "un nombre sin caracteres válidos para la URL (%j) recibe un slug de respaldo, no uno vacío",
    async (nombreNegocio) => {
      const { POST } = await import("./route")

      const res = await POST(pedidoFalso({ nombreNegocio, tipoNegocio: "salon" }))

      expect(res.status).toBe(200)
      const { slug } = prismaMock.business.create.mock.calls[0][0].data
      expect(slug).toMatch(/^negocio-[a-z0-9]{6}$/)
    }
  )
})
