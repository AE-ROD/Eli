import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"

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

  it("con el correo ya registrado no programa nada", async () => {
    const { POST } = await import("./route")
    mockPrisma.user.findUnique.mockResolvedValue({ id: "otro" })

    const respuesta = await POST(pedidoFalso(registroValido))

    expect(respuesta.status).toBe(400)
    expect(mockAfter).not.toHaveBeenCalled()
  })
})
