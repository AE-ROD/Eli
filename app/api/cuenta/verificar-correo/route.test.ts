import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { pedidoFalso } from "@/pruebas/pedidos"
import { hashDeToken } from "@/lib/tokens"

/**
 * Confirmar el correo con el enlace que llega al registrarse (deuda B4). Con
 * la base falsa y el módulo de verdad (`lib/verificacion-de-correo-servidor.ts`
 * y `lib/enviar-correo-de-prueba.ts`): lo único simulado es el envío, el
 * límite y `after`.
 */

const mockVerificarLimite = vi.fn()

vi.mock("@/lib/rate-limit", () => ({
  obtenerIp: () => "203.0.113.7",
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
}))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const mockEnviarCorreoDePrueba = vi.fn()
const mockEnviarVerificacion = vi.fn()

vi.mock("@/lib/email", () => ({
  enviarCorreoDePrueba: (...args: unknown[]) => mockEnviarCorreoDePrueba(...args),
  enviarVerificacionDeCorreo: (...args: unknown[]) => mockEnviarVerificacion(...args),
}))

const mockAfter = vi.fn()

// `after` de verdad exige estar dentro de un pedido de Next: acá se guarda la tarea.
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (tarea: () => unknown) => mockAfter(tarea),
}))

const AHORA = new Date("2026-11-22T15:00:00.000Z")
const TOKEN = "token-del-enlace-de-ana"
const TOKEN_VENCIDO = "token-del-enlace-de-beto"
const HORA = 60 * 60 * 1000
const DIA = 24 * HORA

/** Corre lo que el endpoint dejó para después de responder. */
async function correrLoPendiente() {
  for (const [tarea] of mockAfter.mock.calls) await tarea()
}

const usuario = (id: string) => base.buscar("user", { id })[0]

describe("POST /api/cuenta/verificar-correo", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(AHORA)
    vi.stubEnv("NEXTAUTH_SECRET", "secreto-de-prueba")
    vi.stubEnv("NEXTAUTH_URL", "https://eli.app")
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 4 })
    mockEnviarCorreoDePrueba.mockResolvedValue({ data: { id: "correo-1" }, error: null })
    base.reiniciar({
      user: [
        // Ana se registró hace un día: enlace vigente, dueña de un negocio en prueba.
        {
          id: "ana",
          name: "Ana",
          email: "ana@uno.test",
          password: "hash",
          verificacionTokenHash: hashDeToken(TOKEN),
          verificacionVenceEn: new Date(AHORA.getTime() + 24 * HORA),
          verificacionEnviadaEn: new Date(AHORA.getTime() - 24 * HORA),
        },
        // Beto se registró hace tres días: su enlace venció hace un día.
        {
          id: "beto",
          name: "Beto",
          email: "beto@dos.test",
          password: "hash",
          verificacionTokenHash: hashDeToken(TOKEN_VENCIDO),
          verificacionVenceEn: new Date(AHORA.getTime() - 24 * HORA),
          verificacionEnviadaEn: new Date(AHORA.getTime() - 72 * HORA),
        },
      ],
      business: [
        {
          id: "negocio-ana",
          name: "Spa Ana",
          slug: "spa-ana",
          userId: "ana",
          createdAt: new Date(AHORA.getTime() - DIA),
          pruebaTerminaEl: new Date(AHORA.getTime() + 6 * DIA),
          codigoInvitacion: "codigo-ana",
        },
        {
          id: "negocio-beto",
          name: "Barbería Beto",
          slug: "barberia-beto",
          userId: "beto",
          createdAt: new Date(AHORA.getTime() - 3 * DIA),
          pruebaTerminaEl: new Date(AHORA.getTime() + 4 * DIA),
          codigoInvitacion: "codigo-beto",
        },
      ],
    })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it("con un token válido confirma esa cuenta, y sólo ésa, y borra el token", async () => {
    const { POST } = await import("./route")

    const respuesta = await POST(pedidoFalso({ token: TOKEN }))

    expect(respuesta.status).toBe(200)
    expect(await respuesta.json()).toEqual({ ok: true })
    expect(usuario("ana")).toMatchObject({
      emailVerificadoEn: AHORA,
      verificacionTokenHash: null,
      verificacionVenceEn: null,
    })
    // La otra cuenta no se toca.
    expect(usuario("beto").emailVerificadoEn).toBeNull()
    expect(usuario("beto").verificacionTokenHash).toBe(hashDeToken(TOKEN_VENCIDO))
  })

  it("al confirmar sale la bienvenida del negocio, una sola vez, al correo de la dueña", async () => {
    const { POST } = await import("./route")

    await POST(pedidoFalso({ token: TOKEN }))
    expect(mockEnviarCorreoDePrueba).not.toHaveBeenCalled()
    await correrLoPendiente()

    expect(mockEnviarCorreoDePrueba).toHaveBeenCalledTimes(1)
    expect(mockEnviarCorreoDePrueba.mock.calls[0][0]).toBe("bienvenida")
    expect(mockEnviarCorreoDePrueba.mock.calls[0][1]).toMatchObject({ emailDueno: "ana@uno.test", nombreNegocio: "Spa Ana" })
    expect(base.buscar("correoDeCuenta")).toMatchObject([{ businessId: "negocio-ana", tipo: "bienvenida" }])
  })

  it("si la bienvenida ya se le había mandado al negocio, no sale otra", async () => {
    const { POST } = await import("./route")
    await base.prisma.correoDeCuenta.create({ data: { businessId: "negocio-ana", tipo: "bienvenida" } })

    await POST(pedidoFalso({ token: TOKEN }))
    await correrLoPendiente()

    expect(mockEnviarCorreoDePrueba).not.toHaveBeenCalled()
    expect(base.buscar("correoDeCuenta")).toHaveLength(1)
  })

  it("con la prueba ya terminada confirma igual, pero no manda una bienvenida a destiempo", async () => {
    const { POST } = await import("./route")
    await base.prisma.business.update({ where: { id: "negocio-ana" }, data: { pruebaTerminaEl: new Date(AHORA.getTime() - HORA) } })

    const respuesta = await POST(pedidoFalso({ token: TOKEN }))
    await correrLoPendiente()

    expect(respuesta.status).toBe(200)
    expect(usuario("ana").emailVerificadoEn).toEqual(AHORA)
    expect(mockEnviarCorreoDePrueba).not.toHaveBeenCalled()
  })

  it("una cuenta sin negocio (quedó sin confirmar por otro camino) confirma sin mandar nada", async () => {
    const { POST } = await import("./route")
    await base.prisma.business.delete({ where: { id: "negocio-ana" } })

    const respuesta = await POST(pedidoFalso({ token: TOKEN }))
    await correrLoPendiente()

    expect(respuesta.status).toBe(200)
    expect(mockEnviarCorreoDePrueba).not.toHaveBeenCalled()
  })

  it("usado dos veces: la segunda responde 410 y no manda otra bienvenida", async () => {
    const { POST } = await import("./route")

    const primera = await POST(pedidoFalso({ token: TOKEN }))
    const segunda = await POST(pedidoFalso({ token: TOKEN }))
    await correrLoPendiente()

    expect(primera.status).toBe(200)
    expect(segunda.status).toBe(410)
    expect(mockAfter).toHaveBeenCalledTimes(1)
    expect(mockEnviarCorreoDePrueba).toHaveBeenCalledTimes(1)
    expect(usuario("ana").emailVerificadoEn).toEqual(AHORA)
  })

  it("un enlace vencido responde 410 y no confirma nada", async () => {
    const { POST } = await import("./route")

    const respuesta = await POST(pedidoFalso({ token: TOKEN_VENCIDO }))

    expect(respuesta.status).toBe(410)
    expect(usuario("beto").emailVerificadoEn).toBeNull()
    expect(mockAfter).not.toHaveBeenCalled()
  })

  it.each([
    ["un token que no existe", { token: "no-es-de-nadie" }],
    ["el hash en vez del token (quien leyó la base no puede confirmar)", { token: hashDeToken(TOKEN) }],
    ["un token vacío", { token: "" }],
    ["un token que no es texto", { token: { not: null } }],
    ["un token larguísimo", { token: "a".repeat(5000) }],
    ["sin token", {}],
    ["un cuerpo que no es JSON", "{no es json"],
  ])("%s: el mismo 410 que un enlace vencido, sin escribir nada", async (_caso, cuerpo) => {
    const { POST } = await import("./route")
    const antes = base.volcado()
    const vencido = await POST(pedidoFalso({ token: TOKEN_VENCIDO }))

    const respuesta = await POST(pedidoFalso(cuerpo))

    expect(respuesta.status).toBe(410)
    // No sirve para averiguar si un enlace existió: el cuerpo es idéntico.
    expect(await respuesta.json()).toEqual(await vencido.json())
    expect(base.volcado()).toEqual(antes)
    expect(mockAfter).not.toHaveBeenCalled()
  })

  it("lleva su propio límite por IP (`auth`, falla cerrado): pasado el tope, 429 sin tocar la base", async () => {
    const { POST } = await import("./route")
    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })
    const antes = base.volcado()

    const respuesta = await POST(pedidoFalso({ token: TOKEN }))

    expect(respuesta.status).toBe(429)
    expect(mockVerificarLimite).toHaveBeenCalledWith("auth", "verificar-correo:203.0.113.7")
    expect(base.volcado()).toEqual(antes)
  })

  it("la respuesta no lleva el token, su hash ni datos de la cuenta", async () => {
    const { POST } = await import("./route")

    const texto = JSON.stringify(await (await POST(pedidoFalso({ token: TOKEN }))).json())

    expect(texto).not.toContain(TOKEN)
    expect(texto).not.toContain(hashDeToken(TOKEN))
    expect(texto).not.toContain("ana")
  })

  it("sólo existe el POST: abrir el enlace (un GET de un antivirus o una vista previa) no gasta nada", async () => {
    const ruta = await import("./route")

    expect(Object.keys(ruta)).toEqual(["POST"])
  })
})
