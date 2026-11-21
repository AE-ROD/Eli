import { randomBytes } from "node:crypto"
import { describe, it, expect, vi, beforeEach } from "vitest"
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

// La conexión con WhatsApp de verdad no se abre en los tests: se mira qué negocio se pide.
const gestor = vi.hoisted(() => ({
  conectarWhatsapp: vi.fn(async (_negocioId: string) => {}),
  desconectarWhatsapp: vi.fn(async (_negocioId: string) => {}),
  qrPendiente: vi.fn((_negocioId: string): string | null => null),
}))
vi.mock("@/lib/secretaria/whatsapp/gestor", () => gestor)
vi.mock("@/lib/secretaria/modelo", () => ({ clienteDelModelo: () => ({ messages: { create: crearMensaje } }) }))

const ajustes = () => import("./ajustes/route")
const whatsapp = () => import("./whatsapp/route")
const simulador = () => import("./simulador/route")
const devolver = () => import("./conversaciones/[id]/devolver/route")

const AJUSTES = { activa: true, maxTurnos: 10, maxTokens: 200, reglas: "Sin reservas los sábados" }
const ACEPTA = { aceptoLasCondiciones: true }

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

beforeEach(() => {
  vi.clearAllMocks()
  gestor.qrPendiente.mockReturnValue(null)
  escenario()
})

describe("ajustes y WhatsApp: sólo la dueña", () => {
  it.each([
    ["el encargado", sesiones.encargado],
    ["la profesional", sesiones.carla],
    ["sin sesión", null],
  ])("%s recibe 404 y no se escribe nada", async (_quien, sesion) => {
    como(sesion)
    expect((await (await ajustes()).PUT(pedido("http://x/api/secretaria/ajustes", AJUSTES))).status).toBe(404)
    expect((await (await whatsapp()).POST(pedido("http://x/api/secretaria/whatsapp", ACEPTA))).status).toBe(404)
    expect((await (await whatsapp()).DELETE()).status).toBe(404)
    expect(base.buscar("ajustesDeSecretaria")).toHaveLength(0)
    expect(base.buscar("canalDeWhatsapp")).toHaveLength(0)
    expect(gestor.conectarWhatsapp).not.toHaveBeenCalled()
    expect(gestor.desconectarWhatsapp).not.toHaveBeenCalled()
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

  it("sin aceptar las condiciones no se conecta", async () => {
    como(sesiones.dueña)
    for (const cuerpo of [{}, { aceptoLasCondiciones: false }, { aceptoLasCondiciones: "sí" }]) {
      expect((await (await whatsapp()).POST(pedido("http://x/api/secretaria/whatsapp", cuerpo))).status).toBe(400)
    }
    expect(base.buscar("canalDeWhatsapp")).toHaveLength(0)
    expect(gestor.conectarWhatsapp).not.toHaveBeenCalled()
  })

  it("la dueña acepta y conecta: queda registrado quién aceptó y recibe el QR de su negocio", async () => {
    como(sesiones.dueña)
    gestor.qrPendiente.mockReturnValue("codigo-del-qr")
    const respuesta = await (await whatsapp()).POST(pedido("http://x/api/secretaria/whatsapp", ACEPTA))
    expect(respuesta.status).toBe(200)
    const cuerpo = await respuesta.json()
    expect(cuerpo).toMatchObject({ estado: "esperando_qr", condicionesAceptadas: true })
    expect(cuerpo.qr).toMatch(/^data:image\/png;base64,/)
    expect(gestor.conectarWhatsapp).toHaveBeenCalledWith(NEGOCIO)
    expect(gestor.qrPendiente).toHaveBeenCalledWith(NEGOCIO)
    expect(base.buscar("canalDeWhatsapp")).toEqual([
      expect.objectContaining({ businessId: NEGOCIO, condicionesAceptadasPor: "u-duena", condicionesAceptadasAt: expect.any(Date) }),
    ])
  })

  it("el encargado ve el estado, pero no el QR", async () => {
    gestor.qrPendiente.mockReturnValue("codigo-del-qr")
    base.reiniciar({ ...base.volcado(), canalDeWhatsapp: [{ id: "canal-1", businessId: NEGOCIO, estado: "esperando_qr" }] })
    como(sesiones.encargado)
    const respuesta = await (await whatsapp()).GET()
    expect(respuesta.status).toBe(200)
    expect(await respuesta.json()).toMatchObject({ estado: "esperando_qr", qr: null })
    como(sesiones.carla)
    expect((await (await whatsapp()).GET()).status).toBe(404)
  })

  it("cada dueña ve sólo su WhatsApp, y no recibe datos de la sesión", async () => {
    base.reiniciar({
      ...base.volcado(),
      canalDeWhatsapp: [
        { id: "canal-1", businessId: NEGOCIO, estado: "conectado", numero: "+56900000001", credencialesCifradas: "v1:secreto" },
        { id: "canal-2", businessId: OTRO_NEGOCIO, estado: "conectado", numero: "+56900000002", credencialesCifradas: "v1:otro" },
      ],
    })
    como(sesiones.dueña)
    const cuerpo = await (await (await whatsapp()).GET()).json()
    expect(cuerpo).toMatchObject({ estado: "conectado", numero: "+56900000001" })
    expect(JSON.stringify(cuerpo)).not.toContain("v1:")
  })

  it("desconectar desconecta sólo el negocio de la sesión", async () => {
    como(sesiones.dueña)
    expect((await (await whatsapp()).DELETE()).status).toBe(200)
    expect(gestor.desconectarWhatsapp).toHaveBeenCalledWith(NEGOCIO)
    expect(gestor.desconectarWhatsapp).toHaveBeenCalledTimes(1)
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
