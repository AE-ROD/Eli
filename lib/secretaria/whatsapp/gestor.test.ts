import { randomBytes } from "node:crypto"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type Anthropic from "@anthropic-ai/sdk"
import type { WAMessage, proto } from "baileys"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase } from "@/pruebas/datos"
import * as email from "@/lib/email"

/**
 * La Secretaria Eli de punta a punta: llega un mensaje por WhatsApp (la
 * conexión de Baileys, falsa: se le pasan los mensajes como los entrega), la
 * Secretaria llama al modelo (falso) y sus herramientas corren sobre la base
 * falsa (con la misma lógica de reserva que la página pública), y la respuesta
 * sale por el WhatsApp del negocio (falso: `enviarPorWhatsapp`).
 */

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
  enviarWhatsappDesconectado: vi.fn(async () => null),
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

// Lo que sale por WhatsApp: el negocio, el chat y el texto. Devuelve el id del mensaje, como WhatsApp.
const envio = vi.hoisted(() => {
  let siguiente = 1
  return {
    enviarPorWhatsapp: vi.fn(async (_negocioId: string, _jid: string, _texto: string, _sigue?: () => Promise<boolean>) => ({ id: `ELI-${siguiente++}` }) as { id: string } | null),
  }
})
vi.mock("@/lib/secretaria/whatsapp/envio", () => envio)

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

// ─── WhatsApp falso ───────────────────────────────────────────────────────────

const CONEXION = { negocioId: NEGOCIO, canalId: "canal-1", enviados: new Set<string>() }
const CONEXION_AJENA = { negocioId: OTRO_NEGOCIO, canalId: "canal-2", enviados: new Set<string>() }
let siguienteMensaje = 1

interface Opciones {
  id?: string
  jid?: string
  jidAlterno?: string
  deLaDueña?: boolean
  contenido?: proto.IMessage
  haceSegundos?: number
}

/** Un mensaje tal como lo entrega Baileys. `de` es el número sin "+". */
function mensaje(de: string, cuerpo: string, opciones: Opciones = {}): WAMessage {
  return {
    key: {
      remoteJid: opciones.jid ?? `${de}@s.whatsapp.net`,
      remoteJidAlt: opciones.jidAlterno,
      fromMe: opciones.deLaDueña ?? false,
      id: opciones.id ?? `WA-${siguienteMensaje++}`,
    },
    message: opciones.contenido ?? { conversation: cuerpo },
    messageTimestamp: Math.floor(Date.now() / 1000) - (opciones.haceSegundos ?? 0),
  } as WAMessage
}

const sinLid = async () => null

/** Se importa tarde: la base falsa tiene que existir antes que el módulo que la usa. */
async function recibirMensajes(...args: Parameters<typeof import("./gestor").recibirMensajes>) {
  const gestor = await import("./gestor")
  return gestor.recibirMensajes(...args)
}

async function escribe(de: string, cuerpo: string, conexion = CONEXION, opciones: Opciones = {}) {
  await recibirMensajes(conexion, [mensaje(de, cuerpo, opciones)], "notify", sinLid)
}

/** Los textos que salieron por WhatsApp, en orden. */
function enviados(): { negocio: string; jid: string; texto: string }[] {
  return envio.enviarPorWhatsapp.mock.calls.map(([negocio, jid, texto]) => ({ negocio, jid, texto }))
}

// ─── Escenario ──────────────────────────────────────────────────────────────

/** El lunes 7 de enero de 2030; el reloj, el domingo anterior al mediodía. */
const LUNES = "2030-01-07"

function escenario(extra: { ajustes?: Record<string, unknown>; consumo?: Record<string, unknown>[]; canal?: Record<string, unknown> } = {}) {
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
      { id: "canal-1", businessId: NEGOCIO, estado: "conectado", numero: "+56900000001", ...extra.canal },
      { id: "canal-2", businessId: OTRO_NEGOCIO, estado: "conectado", numero: "+56900000002" },
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
  CONEXION.enviados.clear()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2030-01-06T15:00:00.000Z"))
})

afterEach(() => {
  vi.useRealTimers()
})

// ─── Los casos ──────────────────────────────────────────────────────────────

describe("WhatsApp: qué mensajes se atienden", () => {
  it("el mismo mensaje dos veces (WhatsApp lo reentregó) se atiende una sola vez", async () => {
    escenario()
    crearMensaje.mockResolvedValue(texto("¡Hola! ¿En qué te ayudo?"))
    await escribe("56911111111", "hola", CONEXION, { id: "WA-repetido" })
    await escribe("56911111111", "hola", CONEXION, { id: "WA-repetido" })
    expect(base.buscar("mensajeDeSecretaria", { rol: "user" })).toHaveLength(1)
    expect(crearMensaje).toHaveBeenCalledTimes(1)
  })

  it("grupos, estados y listas de difusión se ignoran", async () => {
    escenario()
    for (const jid of ["120363000000000000@g.us", "status@broadcast", "1234567890@broadcast", "120363000000@newsletter"]) {
      await escribe("56911111111", "hola", CONEXION, { jid })
    }
    expect(base.buscar("conversacionDeSecretaria")).toHaveLength(0)
    expect(crearMensaje).not.toHaveBeenCalled()
  })

  it("un mensaje viejo (llegó mientras estaba desconectada hace rato) no se responde", async () => {
    escenario()
    await escribe("56911111111", "hola", CONEXION, { haceSegundos: 11 * 60 })
    expect(base.buscar("conversacionDeSecretaria")).toHaveLength(0)
    expect(crearMensaje).not.toHaveBeenCalled()
  })

  it("el historial que sincroniza WhatsApp (\"append\") no se responde", async () => {
    escenario()
    await recibirMensajes(CONEXION, [mensaje("56911111111", "hola")], "append", sinLid)
    expect(base.buscar("conversacionDeSecretaria")).toHaveLength(0)
  })

  it("una reacción o un mensaje del sistema no se responde; un audio sí, avisando que no es texto", async () => {
    escenario()
    await escribe("56911111111", "", CONEXION, { contenido: { reactionMessage: { text: "👍" } } })
    expect(base.buscar("conversacionDeSecretaria")).toHaveLength(0)

    crearMensaje.mockResolvedValueOnce(texto("Por ahora sólo leo texto. ¿Me lo escribes?"))
    await escribe("56911111111", "", CONEXION, { contenido: { audioMessage: { seconds: 5 } } })
    expect(JSON.stringify(vistos[0].messages)).toContain("no es texto")
    expect(enviados()).toHaveLength(1)
  })

  it("un chat con id privado (LID) usa el número que trae WhatsApp y responde a ese mismo chat", async () => {
    escenario()
    crearMensaje.mockResolvedValue(texto("¡Hola!"))
    await escribe("56911111111", "hola", CONEXION, { jid: "123456789012345@lid", jidAlterno: "56911111111@s.whatsapp.net" })
    expect(base.buscar("conversacionDeSecretaria")[0]).toMatchObject({ telefono: "+56911111111", waJid: "123456789012345@lid" })
    expect(enviados()[0]).toMatchObject({ negocio: NEGOCIO, jid: "123456789012345@lid" })

    // Sin el número en el mensaje, se lo pregunta a la sesión.
    const telefonoDeLid = vi.fn(async () => "56944444444@s.whatsapp.net")
    await recibirMensajes(CONEXION, [mensaje("", "hola", { jid: "999@lid" })], "notify", telefonoDeLid)
    expect(telefonoDeLid).toHaveBeenCalledWith("999@lid")
    expect(base.buscar("conversacionDeSecretaria", { waJid: "999@lid" })[0]).toMatchObject({ telefono: "+56944444444" })
  })

  it("sin número de teléfono no se guarda nada", async () => {
    escenario()
    await recibirMensajes(CONEXION, [mensaje("", "hola", { jid: "999@lid" })], "notify", sinLid)
    expect(base.buscar("conversacionDeSecretaria")).toHaveLength(0)
  })

  it("apagada en los ajustes, o con el WhatsApp desconectado, guarda el mensaje pero no responde", async () => {
    escenario({ ajustes: { activa: false } })
    await escribe("56911111111", "hola")
    expect(base.buscar("mensajeDeSecretaria", { rol: "user" })).toHaveLength(1)
    expect(crearMensaje).not.toHaveBeenCalled()

    escenario({ canal: { estado: "desconectado" } })
    await escribe("56911111111", "hola")
    expect(crearMensaje).not.toHaveBeenCalled()
    expect(enviados()).toHaveLength(0)
  })
})

describe("WhatsApp: la dueña responde desde su celular", () => {
  it("si la dueña escribe en el chat, la Secretaria se retira de esa conversación", async () => {
    escenario()
    crearMensaje.mockResolvedValue(texto("¡Hola! ¿Qué servicio buscas?"))
    await escribe("56911111111", "hola")
    await escribe("56911111111", "Hola Lucía, soy Ana, te ayudo yo", CONEXION, { deLaDueña: true })

    expect(base.buscar("conversacionDeSecretaria")[0]).toMatchObject({
      estado: "human",
      motivoDerivacion: "La dueña respondió desde su celular.",
    })
    await escribe("56911111111", "gracias Ana")
    expect(crearMensaje).toHaveBeenCalledTimes(1)
    expect(enviados()).toHaveLength(1)
    // No se le manda correo: ella misma la tomó.
    expect(email.enviarDerivacionDeSecretaria).not.toHaveBeenCalled()
  })

  it("los mensajes que mandó la Secretaria no cuentan como de la dueña", async () => {
    escenario()
    crearMensaje.mockResolvedValue(texto("¡Hola!"))
    await escribe("56911111111", "hola")
    const [{ waMessageId }] = base.buscar("mensajeDeSecretaria", { rol: "assistant" })
    expect(waMessageId).toMatch(/^ELI-/)

    // Vuelve como "mío" (después de reiniciar el servidor, por ejemplo): está guardado como de la Secretaria.
    await escribe("56911111111", "¡Hola!", CONEXION, { deLaDueña: true, id: String(waMessageId) })
    // O lo recuerda la conexión.
    CONEXION.enviados.add("ELI-en-memoria")
    await escribe("56911111111", "¡Hola!", CONEXION, { deLaDueña: true, id: "ELI-en-memoria" })
    expect(base.buscar("conversacionDeSecretaria")[0]).toMatchObject({ estado: "bot" })
  })

  it("si la dueña toma el chat mientras la Secretaria escribe, esa respuesta no sale", async () => {
    escenario()
    crearMensaje.mockResolvedValue(texto("¡Hola! ¿Qué servicio buscas?"))
    envio.enviarPorWhatsapp.mockImplementationOnce(async (_n, _j, _t, sigue) => {
      // Mientras "escribe", la dueña responde desde su celular.
      await escribe("56911111111", "Te atiendo yo", CONEXION, { deLaDueña: true })
      return (await sigue!()) ? { id: "ELI-no" } : null
    })
    await escribe("56911111111", "hola")
    expect(base.buscar("mensajeDeSecretaria", { rol: "assistant" })).toHaveLength(0)
    expect(base.buscar("conversacionDeSecretaria")[0]).toMatchObject({ estado: "human" })
  })

  it("la dueña escribiéndole a alguien que no habló con la Secretaria no crea nada", async () => {
    escenario()
    await escribe("56955555555", "Hola prima", CONEXION, { deLaDueña: true })
    expect(base.buscar("conversacionDeSecretaria")).toHaveLength(0)
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

    // Las tres respuestas salieron por el WhatsApp del negocio, al chat que escribió.
    expect(enviados().map((envio) => envio.texto)).toEqual([
      "¡Hola! ¿Me dices tu nombre y apellido?",
      "Tengo 09:00, 13:00 o 17:00 el lunes. ¿Cuál prefieres?",
      "¡Listo! Corte el lunes 7 a las 09:00, $8.000.",
    ])
    expect(enviados().every((envio) => envio.negocio === NEGOCIO && envio.jid === "56911111111@s.whatsapp.net")).toBe(true)
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
    expect(envio.enviarPorWhatsapp).toHaveBeenCalledTimes(2)
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
    await escribe("56922222222", "Hola", CONEXION_AJENA)

    expect(resultadoVistoEn(1)).toEqual({ registrada: false })
    expect(resultadoVistoEn(2)).toHaveProperty("error")
    const servicios = (resultadoVistoEn(3) as { servicios: { id: string }[] }).servicios.map((servicio) => servicio.id)
    expect(servicios).toEqual(["s-ajeno"])

    // La conversación es del negocio 2, y la respuesta salió por su WhatsApp.
    expect(base.buscar("conversacionDeSecretaria")[0]).toMatchObject({ businessId: OTRO_NEGOCIO, canalId: "canal-2", customerId: null })
    expect(enviados()[0].negocio).toBe(OTRO_NEGOCIO)
  })

  it("una reserva pedida desde el negocio 2 con un servicio del negocio 1 se rechaza y no toca su agenda", async () => {
    escenario()
    crearMensaje
      .mockResolvedValueOnce(herramienta("registrar_cliente", { nombre: "Rosa Díaz" }))
      .mockResolvedValueOnce(herramienta("crear_reserva", { servicio_id: "s-corte", fecha: LUNES, hora: "10:00", profesional_id: null }))
      .mockResolvedValueOnce(texto("Ese servicio no está disponible."))
    await escribe("56933333333", "Quiero un corte", CONEXION_AJENA)

    expect(resultadoVistoEn(2)).toHaveProperty("error")
    expect(base.buscar("appointment")).toHaveLength(0)
    expect(base.buscar("customer", { phone: "+56933333333" })[0]).toMatchObject({ businessId: OTRO_NEGOCIO })
  })

  it("la misma clienta escribiéndole a los dos negocios tiene dos conversaciones separadas", async () => {
    escenario()
    crearMensaje.mockResolvedValue(texto("¡Hola!"))
    await escribe("56911111111", "hola uno")
    await escribe("56911111111", "hola dos", CONEXION_AJENA)
    // La dueña del negocio 2 la toma: la del negocio 1 sigue con la Secretaria.
    await escribe("56911111111", "te atiendo yo", CONEXION_AJENA, { deLaDueña: true })
    expect(base.buscar("conversacionDeSecretaria", { businessId: NEGOCIO })[0]).toMatchObject({ estado: "bot" })
    expect(base.buscar("conversacionDeSecretaria", { businessId: OTRO_NEGOCIO })[0]).toMatchObject({ estado: "human" })
  })
})

describe("Secretaria Eli: mensajes seguidos y fallas", () => {
  it("dos mensajes seguidos: se responde de a uno, y la segunda ronda ve los dos", async () => {
    escenario()
    // El modelo de la primera ronda tarda: mientras, llega el segundo mensaje.
    let soltar: () => void = () => {}
    const espera = new Promise<void>((resolver) => (soltar = resolver))
    crearMensaje
      .mockImplementationOnce(async () => {
        await espera
        return texto("¡Hola! ¿Qué día te acomoda?")
      })
      .mockResolvedValueOnce(texto("Perfecto, el lunes. ¿A qué hora?"))

    const primero = escribe("56911111111", "Hola")
    await new Promise((resolver) => setTimeout(resolver, 0))
    const segundo = escribe("56911111111", "Quiero un corte el lunes")
    await new Promise((resolver) => setTimeout(resolver, 0))
    soltar()
    await Promise.all([primero, segundo])

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
      conversacionDeSecretaria: [
        { id: "conv-rota", businessId: NEGOCIO, canalId: "canal-1", telefono: "+56911111111", waJid: "56911111111@s.whatsapp.net" },
      ],
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

  it("si WhatsApp no deja enviar, la conversación pasa a una persona y la dueña recibe el aviso", async () => {
    escenario()
    crearMensaje.mockResolvedValueOnce(texto("¡Hola!"))
    envio.enviarPorWhatsapp.mockRejectedValue(new Error("no conectado"))
    await escribe("56911111111", "hola")
    envio.enviarPorWhatsapp.mockReset()
    envio.enviarPorWhatsapp.mockImplementation(async () => ({ id: "ELI-x" }))

    expect(base.buscar("conversacionDeSecretaria")[0]).toMatchObject({ estado: "human" })
    expect(email.enviarDerivacionDeSecretaria).toHaveBeenCalledTimes(1)
  })
})
