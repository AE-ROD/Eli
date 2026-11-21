import { randomBytes } from "node:crypto"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { NextRequest } from "next/server"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, conId, datosBase, pedido, sesiones } from "@/pruebas/datos"

/**
 * Las rutas de la Secretaria en el panel: quién puede qué (404 para el resto,
 * nunca 403) y que cada una toca sólo el negocio de la sesión.
 */

process.env.WHATSAPP_TOKEN_KEY = randomBytes(32).toString("base64")

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/rate-limit", () => ({ verificarLimite: vi.fn(async () => ({ permitido: true, restantes: 9 })) }))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const crearMensaje = vi.fn()
vi.mock("@/lib/secretaria/modelo", () => ({ clienteDelModelo: () => ({ messages: { create: crearMensaje } }) }))

const ajustes = () => import("./ajustes/route")
const canal = () => import("./canal/route")
const simulador = () => import("./simulador/route")
const devolver = () => import("./conversaciones/[id]/devolver/route")

const AJUSTES = { activa: true, maxTurnos: 10, maxTokens: 200, reglas: "Sin reservas los sábados" }
const CANAL = { phoneNumberId: "1234567890", wabaId: "9876543210", accessToken: "EAAG-secreto", activo: true }

function escenario() {
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    conversacionDeSecretaria: [
      { id: "conv-1", businessId: NEGOCIO, telefono: "+56911111111", estado: "human", turnos: 8, motivoDerivacion: "reclamo" },
      { id: "conv-ajena", businessId: OTRO_NEGOCIO, telefono: "+56911111111", estado: "human", turnos: 8 },
    ],
  })
}

const como = (sesion: unknown) => mockGetServerSession.mockResolvedValue(sesion)

/** Lo que responde Meta al preguntar los números de una cuenta: por defecto, el del pedido es suyo. */
const metaFalsa = vi.fn(async (_url: string, _opciones?: RequestInit) =>
  Response.json({ data: [{ id: "1234567890" }] })
)

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("fetch", metaFalsa)
  escenario()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("ajustes y canal: sólo la dueña", () => {
  it.each([
    ["el encargado", sesiones.encargado],
    ["la profesional", sesiones.carla],
    ["sin sesión", null],
  ])("%s recibe 404 y no se escribe nada", async (_quien, sesion) => {
    como(sesion)
    expect((await (await ajustes()).PUT(pedido("http://x/api/secretaria/ajustes", AJUSTES))).status).toBe(404)
    expect((await (await canal()).PUT(pedido("http://x/api/secretaria/canal", CANAL))).status).toBe(404)
    expect(base.buscar("ajustesDeSecretaria")).toHaveLength(0)
    expect(base.buscar("canalDeWhatsapp")).toHaveLength(0)
  })

  it("la dueña guarda los ajustes de su negocio; el presupuesto queda en el del plan", async () => {
    como(sesiones.dueña)
    const respuesta = await (await ajustes()).PUT(pedido("http://x/api/secretaria/ajustes", AJUSTES))
    expect(respuesta.status).toBe(200)
    expect(base.buscar("ajustesDeSecretaria")).toEqual([
      expect.objectContaining({ businessId: NEGOCIO, activa: true, maxTurnos: 10, presupuestoMensualCentavos: null }),
    ])
  })

  it("la dueña no puede poner su presupuesto: lo define Eli", async () => {
    como(sesiones.dueña)
    const conPresupuesto = { ...AJUSTES, presupuestoMensualUsd: 500 }
    const respuesta = await (await ajustes()).PUT(pedido("http://x/api/secretaria/ajustes", conPresupuesto))
    expect(respuesta.status).toBe(400)
    expect(base.buscar("ajustesDeSecretaria")).toHaveLength(0)
  })

  it("la dueña conecta su número: el token queda cifrado y no vuelve en la respuesta", async () => {
    como(sesiones.dueña)
    const respuesta = await (await canal()).PUT(pedido("http://x/api/secretaria/canal", CANAL))
    expect(respuesta.status).toBe(200)
    const cuerpo = await respuesta.json()
    expect(JSON.stringify(cuerpo)).not.toContain("EAAG")
    const [guardado] = base.buscar("canalDeWhatsapp")
    expect(guardado).toMatchObject({ businessId: NEGOCIO, phoneNumberId: "1234567890" })
    expect(String(guardado.accessTokenCifrado)).not.toContain("EAAG")

    // Sin token nuevo, se conserva el que había.
    const { accessToken: _sinToken, ...sinToken } = CANAL
    expect((await (await canal()).PUT(pedido("http://x/api/secretaria/canal", { ...sinToken, activo: false }))).status).toBe(200)
    expect(base.buscar("canalDeWhatsapp")[0]).toMatchObject({ activo: false, accessTokenCifrado: guardado.accessTokenCifrado })
  })

  it("si Meta no confirma que el número es de esa cuenta con ese token, no se conecta", async () => {
    como(sesiones.dueña)
    metaFalsa.mockResolvedValueOnce(Response.json({ data: [{ id: "5555555555" }] }))
    expect((await (await canal()).PUT(pedido("http://x/api/secretaria/canal", CANAL))).status).toBe(400)
    metaFalsa.mockResolvedValueOnce(Response.json({ error: { message: "sin permiso" } }, { status: 403 }))
    expect((await (await canal()).PUT(pedido("http://x/api/secretaria/canal", CANAL))).status).toBe(400)
    expect(base.buscar("canalDeWhatsapp")).toHaveLength(0)
    const [url, opciones] = metaFalsa.mock.calls[0]
    expect(url).toContain("/9876543210/phone_numbers")
    expect(new Headers(opciones?.headers).get("authorization")).toBe("Bearer EAAG-secreto")
  })

  it("un número ya conectado a otro negocio no se puede tomar", async () => {
    como(sesiones.dueñoAjeno)
    await (await canal()).PUT(pedido("http://x/api/secretaria/canal", CANAL))
    como(sesiones.dueña)
    const respuesta = await (await canal()).PUT(pedido("http://x/api/secretaria/canal", CANAL))
    expect(respuesta.status).toBe(409)
    expect(base.buscar("canalDeWhatsapp")).toEqual([expect.objectContaining({ businessId: OTRO_NEGOCIO })])
  })
})

describe("simulador y devolver: dueña y encargado", () => {
  it("la profesional recibe 404 en el simulador y no se llama al modelo", async () => {
    como(sesiones.carla)
    const respuesta = await (await simulador()).POST(pedido("http://x/api/secretaria/simulador", { telefono: "+56 9 1111 1111", mensaje: "hola" }))
    expect(respuesta.status).toBe(404)
    expect(crearMensaje).not.toHaveBeenCalled()
  })

  it("el encargado prueba a la Secretaria: la conversación queda como simulación de su negocio", async () => {
    como(sesiones.encargado)
    crearMensaje.mockResolvedValue({
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 5 },
      content: [{ type: "text", text: "¡Hola! ¿En qué te ayudo?" }],
    })
    const respuesta = await (await simulador()).POST(
      pedido("http://x/api/secretaria/simulador", { telefono: "+56 9 2222 2222", mensaje: "hola" }) as NextRequest
    )
    expect(respuesta.status).toBe(200)
    expect(await respuesta.json()).toMatchObject({ respuestas: ["¡Hola! ¿En qué te ayudo?"], derivada: false })
    expect(base.buscar("conversacionDeSecretaria", { simulacion: true })).toEqual([
      expect.objectContaining({ businessId: NEGOCIO, telefono: "+56922222222" }),
    ])
  })

  it("devolver una conversación de otro negocio es 404 y no la toca", async () => {
    como(sesiones.dueña)
    const respuesta = await (await devolver()).POST(new Request("http://x"), conId("conv-ajena"))
    expect(respuesta.status).toBe(404)
    expect(base.buscar("conversacionDeSecretaria", { id: "conv-ajena" })[0]).toMatchObject({ estado: "human" })
  })

  it("devolver la propia la deja otra vez con Eli, con los turnos en cero", async () => {
    como(sesiones.encargado)
    const respuesta = await (await devolver()).POST(new Request("http://x"), conId("conv-1"))
    expect(respuesta.status).toBe(200)
    expect(base.buscar("conversacionDeSecretaria", { id: "conv-1" })[0]).toMatchObject({ estado: "bot", turnos: 0, motivoDerivacion: null })
  })

  it("la profesional no puede devolver", async () => {
    como(sesiones.carla)
    expect((await (await devolver()).POST(new Request("http://x"), conId("conv-1"))).status).toBe(404)
  })
})
