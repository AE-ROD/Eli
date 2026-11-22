import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { pedidoFalso } from "@/pruebas/pedidos"
import { hashDeToken } from "@/lib/tokens"

/**
 * El aviso "Confirma tu correo" del panel: leer si la cuenta confirmó
 * (`GET /api/cuenta/verificacion`) y pedir otro enlace
 * (`POST /api/cuenta/verificacion/reenviar`). Con la base falsa y el módulo de
 * verdad; lo simulado es la sesión, el envío y el límite.
 */

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockVerificarLimite = vi.fn()
vi.mock("@/lib/rate-limit", () => ({
  obtenerIp: () => "203.0.113.7",
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
}))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const mockEnviarVerificacion = vi.fn()
const mockEnviarCorreoDePrueba = vi.fn()
vi.mock("@/lib/email", () => ({
  enviarVerificacionDeCorreo: (...args: unknown[]) => mockEnviarVerificacion(...args),
  enviarCorreoDePrueba: (...args: unknown[]) => mockEnviarCorreoDePrueba(...args),
}))

const mockAfter = vi.fn()
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (tarea: () => unknown) => mockAfter(tarea),
}))

const AHORA = new Date("2026-11-22T15:00:00.000Z")
const HORA = 60 * 60 * 1000
const TOKEN_VIEJO = "token-viejo-de-ana"

const sesionDe = (id: string) => ({ user: { id, email: `${id}@uno.test` } })
const usuario = (id: string) => base.buscar("user", { id })[0]

/** El token del enlace que salió en el último correo. */
function tokenEnviado(): string {
  const { enlaceConfirmar } = mockEnviarVerificacion.mock.calls.at(-1)![0] as { enlaceConfirmar: string }
  return enlaceConfirmar.split("/").pop()!
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  vi.stubEnv("NEXTAUTH_SECRET", "secreto-de-prueba")
  vi.stubEnv("NEXTAUTH_URL", "https://eli.app")
  mockGetServerSession.mockResolvedValue(sesionDe("ana"))
  mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 2 })
  mockEnviarVerificacion.mockResolvedValue({ data: { id: "correo-1" }, error: null })
  base.reiniciar({
    user: [
      {
        id: "ana",
        name: "Ana",
        email: "ana@uno.test",
        password: "hash",
        verificacionTokenHash: hashDeToken(TOKEN_VIEJO),
        verificacionVenceEn: new Date(AHORA.getTime() + 10 * HORA),
        verificacionEnviadaEn: new Date(AHORA.getTime() - 38 * HORA),
      },
      { id: "carla", name: "Carla", email: "carla@dos.test", password: "", emailVerificadoEn: new Date("2026-11-01T12:00:00.000Z") },
      { id: "beto", name: "Beto", email: "beto@tres.test", password: "hash" },
    ],
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe("GET /api/cuenta/verificacion", () => {
  it("sin confirmar: `verificado: false` y el correo de la cuenta de la sesión, nada más", async () => {
    const { GET } = await import("./route")

    const respuesta = await GET()

    expect(respuesta.status).toBe(200)
    expect(await respuesta.json()).toEqual({ verificado: false, email: "ana@uno.test" })
  })

  it("confirmada (entró con Google): `verificado: true`", async () => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValue(sesionDe("carla"))

    expect(await (await GET()).json()).toEqual({ verificado: true, email: "carla@dos.test" })
  })

  it.each([
    ["sin sesión", null],
    ["con una sesión revocada (sin id)", { user: { id: "", email: "ana@uno.test" } }],
    ["con la sesión de una cuenta que ya no existe", { user: { id: "borrada" } }],
  ])("%s: 401 y no dice nada de nadie", async (_caso, sesion) => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValue(sesion)

    const respuesta = await GET()

    expect(respuesta.status).toBe(401)
    expect(JSON.stringify(await respuesta.json())).not.toContain("@")
  })
})

describe("POST /api/cuenta/verificacion/reenviar", () => {
  it("guarda un enlace nuevo (sólo su hash, 48 horas) y lo manda al correo de la cuenta", async () => {
    const { POST } = await import("./reenviar/route")

    const respuesta = await POST()

    expect(respuesta.status).toBe(200)
    expect(mockEnviarVerificacion).toHaveBeenCalledTimes(1)
    expect(mockEnviarVerificacion.mock.calls[0][0]).toMatchObject({ emailUsuario: "ana@uno.test", nombreUsuario: "Ana" })
    const token = tokenEnviado()
    expect(mockEnviarVerificacion.mock.calls[0][0].enlaceConfirmar).toBe(`https://eli.app/verificar-correo/${token}`)
    expect(usuario("ana")).toMatchObject({
      emailVerificadoEn: null,
      verificacionTokenHash: hashDeToken(token),
      verificacionVenceEn: new Date(AHORA.getTime() + 48 * HORA),
      verificacionEnviadaEn: AHORA,
    })
    // El token en claro no queda en ninguna tabla.
    expect(JSON.stringify(base.volcado())).not.toContain(token)
  })

  it("el token no sale en la respuesta, ni en claro ni su hash", async () => {
    const { POST } = await import("./reenviar/route")

    const cuerpo = await (await POST()).json()

    expect(cuerpo).toEqual({ verificado: false })
    expect(JSON.stringify(cuerpo)).not.toContain(tokenEnviado())
  })

  it("el enlace anterior deja de servir y el nuevo confirma la cuenta", async () => {
    const { POST } = await import("./reenviar/route")
    const { POST: confirmar } = await import("../verificar-correo/route")

    await POST()

    expect((await confirmar(pedidoFalso({ token: TOKEN_VIEJO }))).status).toBe(410)
    expect(usuario("ana").emailVerificadoEn).toBeNull()
    expect((await confirmar(pedidoFalso({ token: tokenEnviado() }))).status).toBe(200)
    expect(usuario("ana").emailVerificadoEn).toEqual(AHORA)
  })

  it("una cuenta que nunca tuvo enlace (se registró con el código viejo) también puede pedirlo", async () => {
    const { POST } = await import("./reenviar/route")
    mockGetServerSession.mockResolvedValue(sesionDe("beto"))

    expect((await POST()).status).toBe(200)
    expect(mockEnviarVerificacion.mock.calls[0][0]).toMatchObject({ emailUsuario: "beto@tres.test" })
    expect(usuario("beto").verificacionTokenHash).toBe(hashDeToken(tokenEnviado()))
    // La de Ana no se tocó: el correo de destino sale de la sesión, no del pedido.
    expect(usuario("ana").verificacionTokenHash).toBe(hashDeToken(TOKEN_VIEJO))
  })

  it("tope de 3 por hora por cuenta: pasado, 429 sin mandar ni escribir nada", async () => {
    const { POST } = await import("./reenviar/route")
    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })
    const antes = base.volcado()

    const respuesta = await POST()

    expect(respuesta.status).toBe(429)
    expect(mockVerificarLimite).toHaveBeenCalledWith("reenvioDeVerificacion", "ana")
    expect(mockEnviarVerificacion).not.toHaveBeenCalled()
    expect(base.volcado()).toEqual(antes)
  })

  it("con el correo ya confirmado no manda nada y lo dice", async () => {
    const { POST } = await import("./reenviar/route")
    mockGetServerSession.mockResolvedValue(sesionDe("carla"))
    const antes = base.volcado()

    const respuesta = await POST()

    expect(respuesta.status).toBe(200)
    expect(await respuesta.json()).toEqual({ verificado: true })
    expect(mockEnviarVerificacion).not.toHaveBeenCalled()
    expect(base.volcado()).toEqual(antes)
  })

  it("si el correo no sale (Resend falla), 502 con un mensaje para reintentar", async () => {
    const { POST } = await import("./reenviar/route")
    vi.spyOn(console, "error").mockImplementation(() => {})
    mockEnviarVerificacion.mockResolvedValue({ data: null, error: { name: "rate_limit_exceeded", message: "ana@uno.test" } })

    const respuesta = await POST()

    expect(respuesta.status).toBe(502)
    expect(JSON.stringify(await respuesta.json())).not.toContain("ana@uno.test")
    vi.restoreAllMocks()
  })

  it.each([
    ["sin sesión", null],
    ["con una sesión revocada (sin id)", { user: { id: "" } }],
  ])("%s: 401 antes de contar el límite, sin mandar nada", async (_caso, sesion) => {
    const { POST } = await import("./reenviar/route")
    mockGetServerSession.mockResolvedValue(sesion)

    const respuesta = await POST()

    expect(respuesta.status).toBe(401)
    expect(mockVerificarLimite).not.toHaveBeenCalled()
    expect(mockEnviarVerificacion).not.toHaveBeenCalled()
  })
})
