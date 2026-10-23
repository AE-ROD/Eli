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

const mockAfter = vi.fn()
const mockEnviarBienvenida = vi.fn()

// `after` de verdad exige estar dentro de un pedido de Next: acá se guarda la
// tarea para ver qué se programó, sin correrla sola.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (tarea: () => unknown) => mockAfter(tarea),
}))

vi.mock("@/lib/enviar-correo-de-prueba", () => ({
  enviarBienvenida: (...args: unknown[]) => mockEnviarBienvenida(...args),
}))

/** El error que lanza Prisma cuando un `@unique` choca: lo arma a mano para no depender de la base. */
function choqueDeUnico(campo: string) {
  return new Prisma.PrismaClientKnownRequestError(`Unique constraint failed on the fields: (\`${campo}\`)`, {
    code: "P2002",
    clientVersion: "test",
    meta: { target: [campo] },
  })
}

/** Como Prisma: devuelve el registro creado, recortado al `select` si lo hay. */
function crearConSelect(args: { data: Record<string, unknown>; select?: Record<string, boolean> }) {
  const registro: Record<string, unknown> = { id: "negocio-1", ...args.data }
  if (!args.select) return Promise.resolve(registro)
  return Promise.resolve(Object.fromEntries(Object.keys(args.select).map((campo) => [campo, registro[campo]])))
}

/** El error que lanza Prisma cuando una clave foránea no encuentra su fila. */
function claveForaneaRota(campo: string) {
  return new Prisma.PrismaClientKnownRequestError(`Foreign key constraint violated on the constraint: \`${campo}\``, {
    code: "P2003",
    clientVersion: "test",
    meta: { constraint: campo },
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
    prismaMock.business.create.mockImplementation(crearConSelect)
  })

  it.each(RUBROS.map((rubro) => rubro.id))("crea el negocio con el rubro %s del catálogo", async (tipoNegocio) => {
    const { POST } = await import("./route")

    const res = await POST(pedidoFalso({ nombreNegocio: "Salón María", tipoNegocio }))

    expect(res.status).toBe(200)
    expect(prismaMock.business.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: tipoNegocio, userId: "usuario-1" }) })
    )
  })

  it("programa la bienvenida del negocio nuevo para después de responder", async () => {
    const { POST } = await import("./route")

    const res = await POST(pedidoFalso({ nombreNegocio: "Salón María", tipoNegocio: RUBROS[0].id }))

    expect(res.status).toBe(200)
    expect(mockAfter).toHaveBeenCalledTimes(1)
    expect(mockEnviarBienvenida).not.toHaveBeenCalled()
    await mockAfter.mock.calls[0][0]()
    expect(mockEnviarBienvenida).toHaveBeenCalledWith("negocio-1")
  })

  it("responde sólo id, slug y nombre: ni el código de invitación, ni quién invitó, ni el userId", async () => {
    const { POST } = await import("./route")

    const res = await POST(pedidoFalso({ nombreNegocio: "Salón María", tipoNegocio: RUBROS[0].id }))

    expect(res.status).toBe(200)
    expect(prismaMock.business.create).toHaveBeenCalledWith(
      expect.objectContaining({ select: { id: true, slug: true, name: true } })
    )
  })

  it("si el negocio no se crea (P2002), no programa ninguna bienvenida", async () => {
    const { POST } = await import("./route")
    prismaMock.business.create.mockRejectedValueOnce(choqueDeUnico("userId"))

    const res = await POST(pedidoFalso({ nombreNegocio: "Salón María", tipoNegocio: RUBROS[0].id }))

    expect(res.status).toBe(409)
    expect(mockAfter).not.toHaveBeenCalled()
  })

  it("fija el fin de la prueba DIAS_DE_PRUEBA días después de crearlo, y un código de invitación al azar", async () => {
    const { POST } = await import("./route")

    const res = await POST(pedidoFalso({ nombreNegocio: "Salón María", tipoNegocio: RUBROS[0].id }))

    expect(res.status).toBe(200)
    const { createdAt, pruebaTerminaEl, codigoInvitacion, slug } = prismaMock.business.create.mock.calls[0][0].data
    expect(pruebaTerminaEl.getTime() - createdAt.getTime()).toBe(7 * 24 * 60 * 60 * 1000)
    expect(codigoInvitacion).toMatch(/^[0-9a-hjkmnp-tv-z]{10}$/)
    expect(codigoInvitacion).not.toBe(slug)
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
    expect(prismaMock.business.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: "a".repeat(80), teamSize: 500 }) })
    )
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

/**
 * El camino de Google: crear-cuenta dejó el código en la cookie
 * (`/api/referidos/invitacion`) y completar-perfil lo lee al crear el negocio.
 */
describe("POST /api/auth/completar-perfil: invitación", () => {
  const QUIEN_INVITA = { id: "negocio-anfitrion", userId: "usuario-anfitrion" }

  /** Un pedido con la cookie de invitación, si se pasa. */
  const conCookie = (valor?: string) => {
    const pedido = pedidoFalso({ nombreNegocio: "Salón María", tipoNegocio: RUBROS[0].id })
    const cookies = { get: (nombre: string) => (nombre === "eli-invita" && valor !== undefined ? { value: valor } : undefined) }
    return Object.assign(pedido, { cookies })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue(sesion)
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 4 })
    prismaMock.business.findFirst.mockResolvedValue(null)
    prismaMock.business.findUnique.mockImplementation(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.codigoInvitacion === "ab12cd34ef") return QUIEN_INVITA
      // El código del propio usuario: no puede invitarse a sí mismo.
      if (where.codigoInvitacion === "yo12cd34ef") return { id: "negocio-viejo", userId: "usuario-1" }
      return null
    })
    prismaMock.business.create.mockImplementation(crearConSelect)
  })

  const negocioCreado = () => prismaMock.business.create.mock.calls[0][0].data

  it("con un código válido en la cookie, queda invitado y la cookie se vence", async () => {
    const { POST } = await import("./route")

    const res = await POST(conCookie("ab12cd34ef"))

    expect(res.status).toBe(200)
    expect(negocioCreado().invitadoPorId).toBe("negocio-anfitrion")
    expect(res.headers.get("set-cookie")).toMatch(/eli-invita=;.*Max-Age=0/i)
  })

  it.each([
    ["sin cookie", undefined],
    ["con un código que no existe", "qq12cd34ef"],
    ["con un código mal formado", "<script>"],
    ["con el código del propio usuario", "yo12cd34ef"],
  ])("%s: el negocio se crea igual, sin invitación", async (_caso, valor) => {
    const { POST } = await import("./route")

    const res = await POST(conCookie(valor))

    expect(res.status).toBe(200)
    expect(negocioCreado().invitadoPorId).toBeNull()
  })

  it("el cuerpo de la respuesta es sólo { id, slug, name }, sin el id del negocio que invita", async () => {
    const { POST } = await import("./route")

    const res = await POST(conCookie("ab12cd34ef"))

    expect(await res.json()).toEqual({ id: "negocio-1", slug: "salon-maria", name: "Salón María" })
  })

  it("si el negocio que invita se borró antes del create (P2003), se reintenta una vez sin invitación", async () => {
    const { POST } = await import("./route")
    prismaMock.business.create.mockRejectedValueOnce(claveForaneaRota("negocios_invitadoPorId_fkey"))

    const res = await POST(conCookie("ab12cd34ef"))

    expect(res.status).toBe(200)
    expect(prismaMock.business.create).toHaveBeenCalledTimes(2)
    expect(prismaMock.business.create.mock.calls[0][0].data.invitadoPorId).toBe("negocio-anfitrion")
    expect(prismaMock.business.create.mock.calls[1][0].data.invitadoPorId).toBeNull()
    expect(mockAfter).toHaveBeenCalledTimes(1)
  })

  it("un P2003 sin invitación no se reintenta: 500, y el log no lleva el error completo", async () => {
    const { POST } = await import("./route")
    const consola = vi.spyOn(console, "error").mockImplementation(() => {})
    prismaMock.business.create.mockRejectedValueOnce(claveForaneaRota("negocios_userId_fkey"))

    const res = await POST(conCookie(undefined))

    expect(res.status).toBe(500)
    expect(prismaMock.business.create).toHaveBeenCalledTimes(1)
    expect(consola).toHaveBeenCalledWith("Error completando perfil:", {
      name: "PrismaClientKnownRequestError",
      code: "P2003",
    })
    consola.mockRestore()
  })
})
