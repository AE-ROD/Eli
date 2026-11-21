import { createHmac, randomBytes } from "node:crypto"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { NextRequest } from "next/server"
import type Anthropic from "@anthropic-ai/sdk"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase } from "@/pruebas/datos"
import { cuerpoDePrueba } from "@/pruebas/pedidos"
import { cifrarToken } from "@/lib/secretaria/cifrado"
import * as email from "@/lib/email"

/**
 * La Secretaria Eli de punta a punta: el webhook de WhatsApp recibe un
 * mensaje firmado, la Secretaria llama al modelo (falso) y sus herramientas
 * corren sobre la base falsa (con la misma lógica de reserva que la página
 * pública), y la respuesta sale por la Graph API (falsa: `fetch`).
 */

const SECRETO = "secreto-de-la-app"
process.env.WHATSAPP_APP_SECRET = SECRETO
process.env.WHATSAPP_VERIFY_TOKEN = "token-de-verificacion"
process.env.WHATSAPP_TOKEN_KEY = randomBytes(32).toString("base64")

vi.mock("@/lib/rate-limit", () => ({
  obtenerIp: () => "203.0.113.7",
  verificarLimite: vi.fn(async () => ({ permitido: true, restantes: 9 })),
}))

vi.mock("@/lib/email", () => ({
  enviarConfirmacionCliente: vi.fn(async () => null),
  enviarAvisoProfesional: vi.fn(async () => null),
  enviarDerivacionDeSecretaria: vi.fn(async () => null),
  enviarPresupuestoDeSecretaria: vi.fn(async () => null),
}))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

// El modelo: cada test le dice qué responder, en orden.
const crearMensaje = vi.fn()
/** Lo que vio el modelo en cada llamada, copiado en el momento: el arreglo de mensajes sigue creciendo después. */
const vistos: { messages: Anthropic.MessageParam[] }[] = []
vi.mock("@/lib/secretaria/modelo", () => ({
  clienteDelModelo: () => ({
    messages: {
      create: (pedido: { messages: Anthropic.MessageParam[] }) => {
        vistos.push(structuredClone(pedido))
        return crearMensaje(pedido)
      },
    },
  }),
}))

// `after` corre lo pendiente cuando el test lo pide (fuera de Next no hay a quién dárselo).
const pendientes: Promise<unknown>[] = []
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (fn: () => Promise<unknown>) => {
    pendientes.push(fn())
  },
}))

const fetchFalso = vi.fn(async () => new Response("{}", { status: 200 }))


// ─── El modelo falso ──────────────────────────────────────────────────────────

let siguienteLlamada = 1
const uso = { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

function texto(contenido: string): Anthropic.Message {
  return { id: "msg", type: "message", role: "assistant", model: "claude-haiku-5-5", stop_reason: "end_turn", stop_sequence: null, usage: uso, content: [{ type: "text", text: contenido }] } as unknown as Anthropic.Message
}

function herramienta(name: string, input: Record<string, unknown>): Anthropic.Message {
  return { id: "msg", type: "message", role: "assistant", model: "claude-haiku-5-5", stop_reason: "tool_use", stop_sequence: null, usage: uso, content: [{ type: "tool_use", id: `toolu_${siguienteLlamada++}`, name, input }] } as unknown as Anthropic.Message
}

/** Lo que la herramienta le devolvió al modelo en la llamada `n` (empezando en 0). */
function resultadoVistoEn(n: number): Record<string, unknown> {
  const { messages } = vistos[n]
  const ultimo = messages[messages.length - 1]
  const bloque = (ultimo.content as Anthropic.ToolResultBlockParam[])[0]
  return JSON.parse(bloque.content as string)
}

// ─── El webhook ─────────────────────────────────────────────────────────────

const CANAL = "1111111111"
const CANAL_AJENO = "2222222222"
let siguienteMensaje = 1

/** La cuenta de WhatsApp Business de cada número de prueba: la que Meta manda en `entry[].id`. */
const CUENTA: Record<string, string> = { [CANAL]: "111000", [CANAL_AJENO]: "222000" }

function payload(phoneNumberId: string, de: string, cuerpo: string, id = `wamid.${siguienteMensaje++}`, cuenta = CUENTA[phoneNumberId] ?? "999000") {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: cuenta,
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: phoneNumberId, display_phone_number: "56900000000" },
              messages: [{ id, from: de, timestamp: "1", type: "text", text: { body: cuerpo } }],
            },
          },
        ],
      },
    ],
  }
}

function pedidoFirmado(cuerpo: unknown, firma?: string): NextRequest {
  const crudo = JSON.stringify(cuerpo)
  const cabeceras = new Headers({
    "x-hub-signature-256": firma ?? `sha256=${createHmac("sha256", SECRETO).update(crudo).digest("hex")}`,
  })
  return { url: "https://eli.test/api/webhooks/whatsapp", headers: cabeceras, body: cuerpoDePrueba(crudo) } as unknown as NextRequest
}

async function escribe(de: string, cuerpo: string, phoneNumberId = CANAL) {
  const { POST } = await import("./route")
  const respuesta = await POST(pedidoFirmado(payload(phoneNumberId, de, cuerpo)))
  await Promise.all(pendientes.splice(0))
  return respuesta
}

/** Los textos que salieron por la Graph API, en orden. */
function enviados(): { para: string; texto: string; url: string }[] {
  return fetchFalso.mock.calls.map((llamada) => {
    const [url, opciones] = llamada as unknown as [string, RequestInit]
    const cuerpo = JSON.parse(String(opciones.body))
    return { url, para: cuerpo.to, texto: cuerpo.text.body }
  })
}

// ─── Escenario ──────────────────────────────────────────────────────────────

/** El lunes 7 de enero de 2030; el reloj, el domingo anterior al mediodía. */
const LUNES = "2030-01-07"

function escenario(extra: { ajustes?: Record<string, unknown>; consumo?: Record<string, unknown>[] } = {}) {
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    business: datos.business.map((negocio) => ({ ...negocio, user: undefined })),
    customer: [
      ...datos.customer,
      // María, del negocio 1, con su teléfono guardado.
      { id: "c-maria-tel", businessId: NEGOCIO, name: "María José Soto", lastName: null, phone: "+56922222222" },
    ],
    service: datos.service.map((servicio) => (servicio.id === "s-corte" ? { ...servicio, duration: 60 } : servicio)),
    workSchedule: [1, 2, 3, 4, 5].flatMap((dayOfWeek) => [
      { id: `h-${dayOfWeek}`, businessId: NEGOCIO, memberId: null, dayOfWeek, startTime: "09:00", endTime: "18:00" },
      { id: `h-ajeno-${dayOfWeek}`, businessId: OTRO_NEGOCIO, memberId: null, dayOfWeek, startTime: "09:00", endTime: "18:00" },
    ]),
    canalDeWhatsapp: [
      { id: "canal-1", businessId: NEGOCIO, phoneNumberId: CANAL, wabaId: "111000", accessTokenCifrado: cifrarToken("token-uno") },
      { id: "canal-2", businessId: OTRO_NEGOCIO, phoneNumberId: CANAL_AJENO, wabaId: "222000", accessTokenCifrado: cifrarToken("token-dos") },
    ],
    ajustesDeSecretaria: [
      { id: "aj-1", businessId: NEGOCIO, activa: true, ...extra.ajustes },
      { id: "aj-2", businessId: OTRO_NEGOCIO, activa: true },
    ],
    consumoDeSecretaria: extra.consumo ?? [],
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  crearMensaje.mockReset()
  vistos.length = 0
  vi.stubGlobal("fetch", fetchFalso)
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2030-01-06T15:00:00.000Z"))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// ─── Los casos ──────────────────────────────────────────────────────────────

describe("webhook de WhatsApp: verificación y firma", () => {
  it("GET con el token correcto devuelve el desafío; con otro, 403", async () => {
    const { GET } = await import("./route")
    const url = (token: string) =>
      ({ url: `https://eli.test/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=42`, headers: new Headers() }) as unknown as NextRequest
    const bien = await GET(url("token-de-verificacion"))
    expect(bien.status).toBe(200)
    expect(await bien.text()).toBe("42")
    expect((await GET(url("otro"))).status).toBe(403)
  })

  it("un POST sin la firma de Meta es 401 y no guarda nada", async () => {
    escenario()
    const { POST } = await import("./route")
    const respuesta = await POST(pedidoFirmado(payload(CANAL, "56911111111", "hola"), "sha256=00"))
    expect(respuesta.status).toBe(401)
    expect(base.buscar("mensajeDeSecretaria")).toHaveLength(0)
    expect(crearMensaje).not.toHaveBeenCalled()
  })

  it("el mismo mensaje dos veces (reintento de Meta) se atiende una sola vez", async () => {
    escenario()
    crearMensaje.mockResolvedValue(texto("¡Hola! ¿En qué te ayudo?"))
    const { POST } = await import("./route")
    const mismo = payload(CANAL, "56911111111", "hola", "wamid.repetido")
    expect((await POST(pedidoFirmado(mismo))).status).toBe(200)
    expect((await POST(pedidoFirmado(mismo))).status).toBe(200)
    await Promise.all(pendientes.splice(0))
    expect(base.buscar("mensajeDeSecretaria", { rol: "user" })).toHaveLength(1)
    expect(crearMensaje).toHaveBeenCalledTimes(1)
  })
})

describe("Secretaria Eli: reservas", () => {
  it("clienta nueva: la registra, ofrece hasta 3 horarios y reserva en la agenda", async () => {
    escenario()

    // 1. Saluda: no está registrada, le pide el nombre.
    crearMensaje
      .mockResolvedValueOnce(herramienta("buscar_cliente", {}))
      .mockResolvedValueOnce(texto("¡Hola! ¿Me dices tu nombre y apellido?"))
    await escribe("56911111111", "Hola, quiero un corte el lunes")
    expect(resultadoVistoEn(1)).toEqual({ registrada: false })

    // 2. Da su nombre: la registra y busca horarios.
    crearMensaje
      .mockResolvedValueOnce(herramienta("registrar_cliente", { nombre: "Lucía Pérez" }))
      .mockResolvedValueOnce(herramienta("ver_disponibilidad", { servicio_id: "s-corte", fecha: LUNES, profesional_id: null }))
      .mockResolvedValueOnce(texto("Tengo 09:00, 13:00 o 17:00 el lunes. ¿Cuál prefieres?"))
    await escribe("56911111111", "Lucía Pérez")
    const disponibilidad = resultadoVistoEn(4) as { horarios: string[] }
    expect(disponibilidad.horarios.length).toBeGreaterThan(0)
    expect(disponibilidad.horarios.length).toBeLessThanOrEqual(3)

    const [lucia] = base.buscar("customer", { phone: "+56911111111" })
    expect(lucia).toMatchObject({ businessId: NEGOCIO, name: "Lucía Pérez" })

    // 3. Confirma: crea la reserva y manda el resumen.
    crearMensaje
      .mockResolvedValueOnce(herramienta("crear_reserva", { servicio_id: "s-corte", fecha: LUNES, hora: disponibilidad.horarios[0], profesional_id: null }))
      .mockResolvedValueOnce(texto("¡Listo! Corte el lunes 7 a las 09:00, $8.000."))
    await escribe("56911111111", "La primera, sí confirmo")

    expect(resultadoVistoEn(6)).toMatchObject({ reservada: true, servicio: "Corte", fecha: LUNES, precio: "$8.000" })
    const citas = base.buscar("appointment")
    expect(citas).toHaveLength(1)
    expect(citas[0]).toMatchObject({ businessId: NEGOCIO, customerId: lucia.id, serviceId: "s-corte", source: "whatsapp" })

    // Las tres respuestas salieron por la Graph API, al número que escribió, con el canal del negocio.
    expect(enviados().map((envio) => envio.texto)).toEqual([
      "¡Hola! ¿Me dices tu nombre y apellido?",
      "Tengo 09:00, 13:00 o 17:00 el lunes. ¿Cuál prefieres?",
      "¡Listo! Corte el lunes 7 a las 09:00, $8.000.",
    ])
    expect(enviados().every((envio) => envio.para === "56911111111" && envio.url.includes(`/${CANAL}/messages`))).toBe(true)
    expect(base.buscar("consumoDeSecretaria", { businessId: NEGOCIO })[0]).toMatchObject({ mensajesWhatsappEnviados: 3 })
  })

  it("clienta existente: la reconoce por su número y la reserva queda a su nombre", async () => {
    escenario()
    crearMensaje
      .mockResolvedValueOnce(herramienta("buscar_cliente", {}))
      .mockResolvedValueOnce(herramienta("crear_reserva", { servicio_id: "s-corte", fecha: LUNES, hora: "10:00", profesional_id: null }))
      .mockResolvedValueOnce(texto("¡Listo, María José! Te esperamos el lunes a las 10:00."))
    await escribe("56922222222", "Hola, resérvame un corte el lunes a las 10")

    expect(resultadoVistoEn(1)).toEqual({ registrada: true, nombre: "María José Soto" })
    expect(base.buscar("customer", { phone: "+56922222222" })).toHaveLength(1)
    expect(base.buscar("appointment")[0]).toMatchObject({ customerId: "c-maria-tel", source: "whatsapp" })
    expect(base.buscar("conversacionDeSecretaria")[0]).toMatchObject({ customerId: "c-maria-tel", turnos: 1 })
  })
})

describe("Secretaria Eli: derivación y presupuesto", () => {
  it("al llegar a max_turnos deriva: avisa a la clienta, a la dueña y deja de responder", async () => {
    escenario({ ajustes: { maxTurnos: 1 } })
    crearMensaje.mockResolvedValueOnce(texto("¡Hola! ¿Qué servicio buscas?"))
    await escribe("56911111111", "hola")
    await escribe("56911111111", "mmm no sé, ¿qué me recomiendas para el pelo seco?")

    expect(crearMensaje).toHaveBeenCalledTimes(1)
    expect(enviados().map((envio) => envio.texto)).toEqual([
      "¡Hola! ¿Qué servicio buscas?",
      "Le paso tu consulta a Ana, te responde pronto 🙌",
    ])
    expect(base.buscar("conversacionDeSecretaria")[0]).toMatchObject({ estado: "human" })
    expect(base.buscar("avisoDelPanel", { businessId: NEGOCIO, tipo: "derivacion" })).toHaveLength(1)
    expect(email.enviarDerivacionDeSecretaria).toHaveBeenCalledWith(
      expect.objectContaining({ para: "duena@uno.test", telefono: "+56911111111" })
    )

    // Derivada: lo que siga escribiendo se guarda, pero nadie le responde.
    await escribe("56911111111", "¿hola?")
    expect(fetchFalso).toHaveBeenCalledTimes(2)
    expect(base.buscar("mensajeDeSecretaria", { rol: "user" })).toHaveLength(3)
  })

  it("derivar_a_profesional con un profesional del negocio le avisa a esa persona", async () => {
    escenario()
    crearMensaje.mockResolvedValueOnce(herramienta("derivar_a_profesional", { motivo: "Reclamo por un corte", profesional_id: "m-carla" }))
    await escribe("56911111111", "El corte de ayer quedó horrible")

    expect(enviados()[0].texto).toBe("Le paso tu consulta a Carla, te responde pronto 🙌")
    expect(base.buscar("conversacionDeSecretaria")[0]).toMatchObject({ estado: "human", derivadaAMemberId: "m-carla" })
    expect(email.enviarDerivacionDeSecretaria).toHaveBeenCalledWith(expect.objectContaining({ para: "carla@uno.test" }))
  })

  it("con el presupuesto del mes agotado se pausa: no llama al modelo y deriva", async () => {
    // El negocio 1 es plan Equipo: US$9 = 9.000.000 microdólares.
    escenario({ consumo: [{ id: "co-1", businessId: NEGOCIO, periodo: "2030-01", costoMicrodolares: 9_000_000 }] })
    await escribe("56911111111", "hola")

    expect(crearMensaje).not.toHaveBeenCalled()
    expect(enviados().map((envio) => envio.texto)).toEqual(["Le paso tu consulta a Ana, te responde pronto 🙌"])
    expect(base.buscar("conversacionDeSecretaria")[0]).toMatchObject({ estado: "human" })
  })

  it("el presupuesto sale del plan: un Independiente se pausa con US$3", async () => {
    escenario({ consumo: [{ id: "co-1", businessId: NEGOCIO, periodo: "2030-01", costoMicrodolares: 3_000_000 }] })
    // Cargado tal cual (un Independiente con equipo no pasaría el trigger, pero acá sólo importa el plan).
    const volcado = base.volcado()
    base.reiniciar({ ...volcado, business: volcado.business.map((n) => (n.id === NEGOCIO ? { ...n, plan: "independiente" } : n)) })
    await escribe("56911111111", "hola")
    expect(crearMensaje).not.toHaveBeenCalled()
    expect(base.buscar("conversacionDeSecretaria")[0]).toMatchObject({ estado: "human" })
  })

  it("un presupuesto puesto a mano por Eli en la cuenta manda sobre el del plan", async () => {
    escenario({
      ajustes: { presupuestoMensualCentavos: 2_000 },
      consumo: [{ id: "co-1", businessId: NEGOCIO, periodo: "2030-01", costoMicrodolares: 9_000_000 }],
    })
    crearMensaje.mockResolvedValueOnce(texto("¡Hola!"))
    await escribe("56911111111", "hola")
    expect(crearMensaje).toHaveBeenCalledTimes(1)
  })

  it("al cruzar el 80 % avisa una sola vez a la dueña", async () => {
    // A 20 microdólares del 80 %: una llamada (100 de entrada + 50 de salida = 35) lo cruza.
    escenario({ consumo: [{ id: "co-1", businessId: NEGOCIO, periodo: "2030-01", costoMicrodolares: 7_199_980 }] })
    crearMensaje.mockResolvedValue(texto("¡Hola!"))
    await escribe("56911111111", "hola")
    await escribe("56911111111", "¿sigues ahí?")

    expect(base.buscar("consumoDeSecretaria")[0].alerta80At).toBeInstanceOf(Date)
    expect(base.buscar("consumoDeSecretaria")[0].alerta100At).toBeNull()
    expect(email.enviarPresupuestoDeSecretaria).toHaveBeenCalledTimes(1)
    expect(base.buscar("avisoDelPanel", { tipo: "presupuesto-80" })).toHaveLength(1)
  })
})

describe("Secretaria Eli: aislamiento entre negocios", () => {
  it("el negocio 2 no ve las clientas, los servicios ni la agenda del negocio 1", async () => {
    escenario()
    // María (+56922222222) es clienta del negocio 1, y le escribe al WhatsApp del negocio 2.
    crearMensaje
      .mockResolvedValueOnce(herramienta("buscar_cliente", {}))
      .mockResolvedValueOnce(herramienta("ver_disponibilidad", { servicio_id: "s-corte", fecha: LUNES, profesional_id: null }))
      .mockResolvedValueOnce(herramienta("listar_servicios", {}))
      .mockResolvedValueOnce(texto("¿Qué servicio quieres?"))
    await escribe("56922222222", "Hola", CANAL_AJENO)

    expect(resultadoVistoEn(1)).toEqual({ registrada: false })
    expect(resultadoVistoEn(2)).toHaveProperty("error")
    const servicios = (resultadoVistoEn(3) as { servicios: { id: string }[] }).servicios.map((servicio) => servicio.id)
    expect(servicios).toEqual(["s-ajeno"])

    // La conversación es del negocio 2, y la respuesta salió por su canal.
    expect(base.buscar("conversacionDeSecretaria")[0]).toMatchObject({ businessId: OTRO_NEGOCIO, customerId: null })
    expect(enviados()[0].url).toContain(`/${CANAL_AJENO}/messages`)
  })

  it("una reserva pedida desde el negocio 2 con un servicio del negocio 1 se rechaza y no toca su agenda", async () => {
    escenario()
    crearMensaje
      .mockResolvedValueOnce(herramienta("registrar_cliente", { nombre: "Rosa Díaz" }))
      .mockResolvedValueOnce(herramienta("crear_reserva", { servicio_id: "s-corte", fecha: LUNES, hora: "10:00", profesional_id: null }))
      .mockResolvedValueOnce(texto("Ese servicio no está disponible."))
    await escribe("56933333333", "Quiero un corte", CANAL_AJENO)

    expect(resultadoVistoEn(2)).toHaveProperty("error")
    expect(base.buscar("appointment")).toHaveLength(0)
    expect(base.buscar("customer", { phone: "+56933333333" })[0]).toMatchObject({ businessId: OTRO_NEGOCIO })
  })

  it("un mensaje con el número del negocio 1 pero desde otra cuenta de WhatsApp Business se ignora", async () => {
    escenario()
    const { POST } = await import("./route")
    const respuesta = await POST(pedidoFirmado(payload(CANAL, "56911111111", "hola", "wamid.otra-cuenta", "222000")))
    await Promise.all(pendientes.splice(0))
    expect(respuesta.status).toBe(200)
    expect(base.buscar("conversacionDeSecretaria")).toHaveLength(0)
    expect(crearMensaje).not.toHaveBeenCalled()
  })

  it("un número que no es de ningún negocio se ignora", async () => {
    escenario()
    const respuesta = await escribe("56911111111", "hola", "9999999999")
    expect(respuesta.status).toBe(200)
    expect(base.buscar("conversacionDeSecretaria")).toHaveLength(0)
    expect(crearMensaje).not.toHaveBeenCalled()
  })
})

describe("Secretaria Eli: mensajes seguidos y fallas", () => {
  it("dos mensajes seguidos: se responde de a uno, y la segunda ronda ve los dos", async () => {
    escenario()
    const { POST } = await import("./route")
    // El modelo de la primera ronda tarda: mientras, llega el segundo mensaje.
    let soltar: () => void = () => {}
    const espera = new Promise<void>((resolver) => (soltar = resolver))
    crearMensaje
      .mockImplementationOnce(async () => {
        await espera
        return texto("¡Hola! ¿Qué día te acomoda?")
      })
      .mockResolvedValueOnce(texto("Perfecto, el lunes. ¿A qué hora?"))

    await POST(pedidoFirmado(payload(CANAL, "56911111111", "Hola")))
    await new Promise((resolver) => setTimeout(resolver, 0))
    await POST(pedidoFirmado(payload(CANAL, "56911111111", "Quiero un corte el lunes")))
    soltar()
    await Promise.all(pendientes.splice(0))

    expect(crearMensaje).toHaveBeenCalledTimes(2)
    const segunda = vistos[1].messages
    expect(JSON.stringify(segunda)).toContain("Quiero un corte el lunes")
    expect(enviados().map((envio) => envio.texto)).toEqual(["¡Hola! ¿Qué día te acomoda?", "Perfecto, el lunes. ¿A qué hora?"])
    expect(base.buscar("conversacionDeSecretaria")[0]).toMatchObject({ respondiendoHasta: null, turnos: 2 })
  })

  it("un historial con una llamada a herramienta sin su resultado se arregla antes de mandarlo", async () => {
    escenario()
    base.reiniciar({
      ...base.volcado(),
      conversacionDeSecretaria: [{ id: "conv-rota", businessId: NEGOCIO, canalId: "canal-1", telefono: "+56911111111" }],
      mensajeDeSecretaria: [
        { id: "m1", businessId: NEGOCIO, conversacionId: "conv-rota", rol: "user", contenido: [{ type: "text", text: "Hola" }], createdAt: new Date("2030-01-06T14:00:00Z") },
        { id: "m2", businessId: NEGOCIO, conversacionId: "conv-rota", rol: "assistant", contenido: [{ type: "tool_use", id: "toolu_x", name: "buscar_cliente", input: {} }], createdAt: new Date("2030-01-06T14:00:01Z") },
        { id: "m3", businessId: NEGOCIO, conversacionId: "conv-rota", rol: "user", contenido: [{ type: "text", text: "¿Hay hora?" }], createdAt: new Date("2030-01-06T14:00:02Z") },
      ],
    })
    crearMensaje.mockResolvedValueOnce(texto("Sí, ¿para qué servicio?"))
    await escribe("56911111111", "¿Me ayudas?")

    const mandados = vistos[0].messages
    expect(JSON.stringify(mandados)).not.toContain("toolu_x")
    expect(mandados.every((mensaje) => mensaje.role === "user")).toBe(true)
    expect(mandados).toHaveLength(1)
  })

  it("si el modelo falla, la clienta no queda sin respuesta: pasa a una persona", async () => {
    escenario()
    crearMensaje.mockRejectedValueOnce(new Error("API caída"))
    await escribe("56911111111", "hola")

    expect(enviados().map((envio) => envio.texto)).toEqual(["Le paso tu consulta a Ana, te responde pronto 🙌"])
    expect(base.buscar("conversacionDeSecretaria")[0]).toMatchObject({ estado: "human", respondiendoHasta: null })
  })
})
