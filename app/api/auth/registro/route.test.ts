import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"
import { Prisma } from "@prisma/client"
import { RUBROS } from "@/lib/rubros"
import { serviciosDeEjemplo } from "@/lib/servicios-de-ejemplo"

const mockVerificarLimite = vi.fn()

vi.mock("@/lib/rate-limit", () => ({
  obtenerIp: () => "203.0.113.7",
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
}))

const mockPrisma = {
  user: { findUnique: vi.fn(), create: vi.fn() },
  business: { findUnique: vi.fn() },
}

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }))

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

const pedidoFalso = (cuerpo: unknown): NextRequest =>
  ({ headers: new Headers(), json: async () => cuerpo }) as unknown as NextRequest

const registroValido = {
  nombre: "Ana",
  email: "ana@example.com",
  contrasena: "password123",
  nombreNegocio: "Spa Ana",
  tipoNegocio: "salon",
}

/**
 * El registro es público: con datos inválidos responde un `error` legible y
 * nada más. Antes devolvía `detalles` con los issues crudos de zod (rutas,
 * códigos, el esquema esperado), que no le sirven a nadie y describen la
 * validación del servidor a quien la quiera esquivar (M10/F-06).
 */
describe("POST /api/auth/registro: datos inválidos", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 4 })
  })

  it.each([
    ["una contraseña de más de 72 caracteres", { contrasena: "a".repeat(73) }, /contraseña/i],
    // 40 caracteres pero 80 bytes en UTF-8: bcrypt la truncaría sin avisar
    ["una contraseña de más de 72 bytes aunque tenga menos de 72 caracteres", { contrasena: "ñ".repeat(40) }, /contraseña/i],
    ["un nombre de negocio de más de 80 caracteres", { nombreNegocio: "a".repeat(81) }, /nombre del negocio/i],
    ["un email inválido", { email: "no-es-un-email" }, /email|correo/i],
  ])("%s: 400 con un error legible, sin detalles crudos ni tocar la base", async (_caso, cambio, mensaje) => {
    const { POST } = await import("./route")

    const respuesta = await POST(pedidoFalso({ ...registroValido, ...cambio }))
    const cuerpo = await respuesta.json()

    expect(respuesta.status).toBe(400)
    expect(Object.keys(cuerpo)).toEqual(["error"])
    expect(cuerpo.error).toMatch(mensaje)
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled()
    expect(mockPrisma.user.create).not.toHaveBeenCalled()
  })
})

describe("POST /api/auth/registro: bienvenida", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 4 })
    mockPrisma.user.findUnique.mockResolvedValue(null)
    mockPrisma.business.findUnique.mockResolvedValue(null)
    mockPrisma.user.create.mockResolvedValue({
      id: "usuario-1",
      name: "Ana",
      email: "ana@example.com",
      business: { id: "negocio-1" },
    })
  })

  it("responde sin esperar el correo y programa la bienvenida del negocio nuevo para después", async () => {
    const { POST } = await import("./route")

    const respuesta = await POST(pedidoFalso(registroValido))

    expect(respuesta.status).toBe(200)
    expect(mockAfter).toHaveBeenCalledTimes(1)
    expect(mockEnviarBienvenida).not.toHaveBeenCalled()
    await mockAfter.mock.calls[0][0]()
    expect(mockEnviarBienvenida).toHaveBeenCalledWith("negocio-1")
  })

  it.each(RUBROS.map((rubro) => rubro.id))(
    "el negocio de rubro %s nace con sus servicios de ejemplo, en la misma escritura que la cuenta",
    async (tipoNegocio) => {
      const { POST } = await import("./route")

      const respuesta = await POST(pedidoFalso({ ...registroValido, tipoNegocio }))

      expect(respuesta.status).toBe(200)
      // Una sola llamada: usuario, negocio y servicios van anidados, todo o nada.
      expect(mockPrisma.user.create).toHaveBeenCalledTimes(1)
      const negocio = mockPrisma.user.create.mock.calls[0][0].data.business.create
      expect(negocio.services).toEqual({ create: serviciosDeEjemplo(tipoNegocio) })
      expect(negocio.services.create.length).toBeGreaterThanOrEqual(4)
    }
  )

  it("con el correo ya registrado no programa nada", async () => {
    const { POST } = await import("./route")
    mockPrisma.user.findUnique.mockResolvedValue({ id: "otro" })

    const respuesta = await POST(pedidoFalso(registroValido))

    expect(respuesta.status).toBe(400)
    expect(mockAfter).not.toHaveBeenCalled()
  })
})

/**
 * El enlace de invitación (`?invita=`): con un código de otro negocio, el
 * negocio nuevo queda invitado por él. Cualquier otra cosa se ignora en
 * silencio y la cuenta se crea igual, con la misma respuesta: el registro no
 * dice si un código existe.
 */
describe("POST /api/auth/registro: invitación", () => {
  const QUIEN_INVITA = { id: "negocio-anfitrion", userId: "usuario-anfitrion" }

  beforeEach(() => {
    vi.clearAllMocks()
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 4 })
    mockPrisma.user.findUnique.mockResolvedValue(null)
    mockPrisma.business.findUnique.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      where.codigoInvitacion === "ab12cd34ef" ? QUIEN_INVITA : null
    )
    mockPrisma.user.create.mockResolvedValue({
      id: "usuario-1",
      name: "Ana",
      email: "ana@example.com",
      business: { id: "negocio-1" },
    })
  })

  const negocioCreado = () => mockPrisma.user.create.mock.calls[0][0].data.business.create

  it("con un código válido, el negocio nuevo queda invitado por el dueño del código", async () => {
    const { POST } = await import("./route")

    const respuesta = await POST(pedidoFalso({ ...registroValido, invita: "AB12CD34EF" }))

    expect(respuesta.status).toBe(200)
    expect(negocioCreado().invitadoPorId).toBe("negocio-anfitrion")
  })

  it("el negocio invitado empieza con la prueba normal, sin días extra", async () => {
    const { POST } = await import("./route")

    await POST(pedidoFalso({ ...registroValido, invita: "ab12cd34ef" }))

    const { createdAt, pruebaTerminaEl } = negocioCreado()
    expect(pruebaTerminaEl.getTime() - createdAt.getTime()).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it("con un código que no existe, la cuenta se crea igual y sin invitación", async () => {
    const { POST } = await import("./route")

    const respuesta = await POST(pedidoFalso({ ...registroValido, invita: "qq12cd34ef" }))

    expect(respuesta.status).toBe(200)
    expect(negocioCreado().invitadoPorId).toBeNull()
  })

  it.each([
    ["mal formado", "no-es-un-codigo"],
    ["un objeto", { $ne: null }],
    ["un número", 12345],
  ])("con un código %s, la cuenta se crea igual y ni se busca", async (_caso, invita) => {
    const { POST } = await import("./route")

    const respuesta = await POST(pedidoFalso({ ...registroValido, invita }))

    expect(respuesta.status).toBe(200)
    expect(negocioCreado().invitadoPorId).toBeNull()
    expect(mockPrisma.business.findUnique).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ codigoInvitacion: expect.anything() }) })
    )
  })

  it("responde lo mismo con un código que existe y con uno que no", async () => {
    const { POST } = await import("./route")

    const conCodigo = await (await POST(pedidoFalso({ ...registroValido, invita: "ab12cd34ef" }))).json()
    const sinCodigo = await (await POST(pedidoFalso({ ...registroValido, invita: "qq12cd34ef" }))).json()

    expect(conCodigo).toEqual(sinCodigo)
  })

  it("si el negocio que invita se borró antes del create (P2003), se reintenta una vez sin invitación", async () => {
    const { POST } = await import("./route")
    mockPrisma.user.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Foreign key constraint violated", {
        code: "P2003",
        clientVersion: "test",
        meta: { constraint: "negocios_invitadoPorId_fkey" },
      })
    )

    const respuesta = await POST(pedidoFalso({ ...registroValido, invita: "ab12cd34ef" }))

    expect(respuesta.status).toBe(200)
    expect(mockPrisma.user.create).toHaveBeenCalledTimes(2)
    expect(mockPrisma.user.create.mock.calls[0][0].data.business.create.invitadoPorId).toBe("negocio-anfitrion")
    expect(mockPrisma.user.create.mock.calls[1][0].data.business.create.invitadoPorId).toBeNull()
  })

  it("un error inesperado da 500 y al log va sólo el nombre y el código, no el error completo", async () => {
    const { POST } = await import("./route")
    const consola = vi.spyOn(console, "error").mockImplementation(() => {})
    mockPrisma.user.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("ana@example.com ya existe", { code: "P2002", clientVersion: "test" })
    )

    const respuesta = await POST(pedidoFalso(registroValido))

    expect(respuesta.status).toBe(500)
    expect(mockPrisma.user.create).toHaveBeenCalledTimes(1)
    expect(consola).toHaveBeenCalledWith("Error en registro:", { name: "PrismaClientKnownRequestError", code: "P2002" })
    consola.mockRestore()
  })
})
