import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { tokenDeBajaDeCliente } from "@/lib/baja-de-clientes"
import { tokenDeBaja } from "@/lib/baja-de-correos"
import { MARCA_DE_CLIENTE_ELIMINADO } from "@/lib/clientes-eliminados"

const mockVerificarLimite = vi.fn()

vi.mock("@/lib/rate-limit", () => ({
  obtenerIp: () => "203.0.113.7",
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
}))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const URL_BAJA = "https://eli.test/api/correos/baja-de-cliente"
const CONSENTIDO = new Date("2026-10-01T12:00:00.000Z")

/** El botón de la página: JSON `{ token }`. */
const conJson = (cuerpo: unknown) =>
  new Request(URL_BAJA, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo),
  }) as unknown as NextRequest

/** La baja en un clic de Gmail y Apple (RFC 8058): token en la consulta y el cuerpo fijo. */
const enUnClic = (token: string) =>
  new Request(`${URL_BAJA}?token=${token}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "List-Unsubscribe=One-Click",
  }) as unknown as NextRequest

const consentido = { correoPromoConsentAt: CONSENTIDO, correoPromoConsentSource: "reserva-publica" }

describe("POST /api/correos/baja-de-cliente", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("NEXTAUTH_SECRET", "secreto-de-prueba")
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 10 })
    base.reiniciar({
      user: [
        { id: "u1", name: "Ana", email: "a@test" },
        { id: "u2", name: "Otro", email: "o@test" },
      ],
      business: [
        { id: "n1", name: "Uno", slug: "uno", userId: "u1" },
        { id: "n2", name: "Dos", slug: "dos", userId: "u2" },
      ],
      customer: [
        { id: "c-maria", businessId: "n1", name: "María", email: "maria@test", ...consentido },
        { id: "c-beto", businessId: "n1", name: "Beto", email: "beto@test", ...consentido },
        { id: "c-ajeno", businessId: "n2", name: "María", email: "maria@test", ...consentido },
      ],
    })
  })

  it("con el botón de la página da de baja a ese cliente y sólo a ése", async () => {
    const { POST } = await import("./route")

    const respuesta = await POST(conJson({ token: tokenDeBajaDeCliente("c-maria") }))

    expect(respuesta.status).toBe(200)
    expect(base.buscar("customer", { id: "c-maria" })[0]).toMatchObject({
      correoPromoConsentAt: null,
      correoPromoConsentSource: null,
      correoPromoBajaAt: expect.any(Date),
    })
    // El mismo email en otro negocio es otro cliente: su consentimiento sigue.
    expect(base.buscar("customer", { id: "c-ajeno" })[0]).toMatchObject({ ...consentido, correoPromoBajaAt: null })
    expect(base.buscar("customer", { id: "c-beto" })[0]).toMatchObject({ ...consentido, correoPromoBajaAt: null })
  })

  it("con la baja en un clic (RFC 8058): token en la consulta, cuerpo fijo", async () => {
    const { POST } = await import("./route")

    const respuesta = await POST(enUnClic(tokenDeBajaDeCliente("c-maria")))

    expect(respuesta.status).toBe(200)
    expect(base.buscar("customer", { id: "c-maria" })[0]).toMatchObject({ correoPromoConsentAt: null })
  })

  it("no exporta GET: abrir el enlace (antivirus, vista previa) nunca da de baja", async () => {
    const ruta = await import("./route")
    expect(Object.keys(ruta)).toEqual(["POST"])
  })

  it("responde exactamente lo mismo con token válido, inválido, de otro contexto, de un cliente borrado o sin cuerpo", async () => {
    const { POST } = await import("./route")

    const respuestas = [
      await POST(conJson({ token: tokenDeBajaDeCliente("c-maria") })),
      await POST(conJson({ token: tokenDeBajaDeCliente("cliente-que-no-existe") })),
      await POST(conJson({ token: "no-es-un-token" })),
      await POST(conJson({ token: tokenDeBaja("c-beto") })),
      await POST(conJson({})),
      await POST(conJson("no es JSON")),
      await POST(enUnClic("no-es-un-token")),
    ]

    const cuerpos = await Promise.all(respuestas.map((respuesta) => respuesta.text()))
    expect(new Set(respuestas.map((respuesta) => respuesta.status))).toEqual(new Set([200]))
    expect(new Set(cuerpos).size).toBe(1)
  })

  it("un token de baja de dueño (otro contexto) o uno inválido no tocan la base", async () => {
    const { POST } = await import("./route")
    const antes = base.volcado()

    await POST(conJson({ token: tokenDeBaja("c-beto") }))
    await POST(conJson({ token: "no-es-un-token" }))
    await POST(enUnClic(`${Buffer.from("c-beto").toString("base64url")}.${tokenDeBajaDeCliente("c-maria").split(".")[1]}`))

    expect(base.volcado()).toEqual(antes)
  })

  it("un cliente eliminado (anonimizado) no se toca", async () => {
    const { POST } = await import("./route")
    base.reiniciar({
      customer: [{ id: "c-borrado", businessId: "n1", name: "Cliente eliminado", tags: [MARCA_DE_CLIENTE_ELIMINADO] }],
    })
    const antes = base.volcado()

    const respuesta = await POST(conJson({ token: tokenDeBajaDeCliente("c-borrado") }))

    expect(respuesta.status).toBe(200)
    expect(base.volcado()).toEqual(antes)
  })

  it("tiene límite por IP con el tipo `bajaPorToken` (falla cerrado): 429 sin tocar la base", async () => {
    const { POST } = await import("./route")
    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })
    const antes = base.volcado()

    const respuesta = await POST(conJson({ token: tokenDeBajaDeCliente("c-maria") }))

    expect(respuesta.status).toBe(429)
    expect(mockVerificarLimite).toHaveBeenCalledWith("bajaPorToken", "baja-de-cliente:203.0.113.7")
    expect(base.volcado()).toEqual(antes)
  })

  it("un cuerpo enorme no se lee: misma respuesta y nada cambia", async () => {
    const { POST } = await import("./route")
    const antes = base.volcado()

    const respuesta = await POST(conJson({ token: tokenDeBajaDeCliente("c-maria"), relleno: "x".repeat(5000) }))

    expect(respuesta.status).toBe(200)
    expect(base.volcado()).toEqual(antes)
  })
})
