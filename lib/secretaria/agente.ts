import Anthropic from "@anthropic-ai/sdk"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { registrarError } from "@/lib/registro-de-errores"
import { correoDelProfesional } from "@/lib/avisos-al-negocio"
import { enviarDerivacionDeSecretaria, enviarPresupuestoDeSecretaria } from "@/lib/email"
import { urlBase } from "@/lib/url-base"
import { zonaDelNegocio } from "@/lib/zona-horaria"
import {
  ALERTA_DE_PRESUPUESTO,
  LARGO_MAXIMO_DEL_MENSAJE,
  MAX_VUELTAS_DE_HERRAMIENTAS,
  MENSAJES_DE_HISTORIAL,
  MODELO_DE_LA_SECRETARIA,
  PRESUPUESTO_AGOTADO,
  type EstadoDeConversacion,
} from "@/lib/secretaria/config"
import {
  SIN_TOKENS,
  costoEnMicrodolares,
  periodoDe,
  porcentajeGastado,
  sumarUso,
  tokensDeEntrada,
  type TokensSumados,
} from "@/lib/secretaria/costo"
import { HERRAMIENTAS, ejecutarHerramienta, type ContextoDeHerramientas, type PedidoDeDerivacion } from "@/lib/secretaria/herramientas"
import { bloqueDeHoy, promptDelNegocio } from "@/lib/secretaria/prompt"
import { clienteDelModelo } from "@/lib/secretaria/modelo"
import { descifrarToken } from "@/lib/secretaria/cifrado"
import { enviarTextoPorWhatsapp } from "@/lib/secretaria/whatsapp"

/**
 * La Secretaria Eli: atiende un mensaje entrante de una conversación. La usan
 * el webhook de WhatsApp y el simulador del panel, con la misma lógica; la
 * única diferencia es por dónde sale la respuesta (la Graph API o la
 * pantalla).
 *
 * El negocio SIEMPRE viene de afuera (el canal de WhatsApp o la sesión del
 * panel) y cada lectura y escritura filtra por él.
 */

/** Lo que ve la clienta al derivar. `{nombre}` es quien la va a atender. */
export function mensajeDeDerivacion(nombre: string): string {
  return `Le paso tu consulta a ${nombre}, te responde pronto 🙌`
}

const AJUSTES_POR_DEFECTO = { activa: false, maxTurnos: 8, maxTokens: 200, presupuestoMensualCentavos: 500, reglas: null }

const TEXTO_SIN_TEXTO = "[La clienta envió un mensaje que no es texto: audio, foto, sticker o archivo.]"

export interface MensajeAGuardar {
  negocioId: string
  /** Null en el simulador. */
  canalId: string | null
  telefono: string
  simulacion: boolean
  texto: string | null
  waMessageId?: string
  ahora: Date
}

/**
 * Guarda el mensaje entrante (y abre la conversación si no existe). Con un
 * `waMessageId` que ya estaba, no guarda nada: es un reintento de Meta.
 */
export async function guardarMensajeEntrante(
  mensaje: MensajeAGuardar
): Promise<{ duplicado: true } | { duplicado: false; conversacionId: string }> {
  const texto = (mensaje.texto?.trim() || TEXTO_SIN_TEXTO).slice(0, LARGO_MAXIMO_DEL_MENSAJE)
  try {
    return await prisma.$transaction(async (tx) => {
      const conversacion = await tx.conversacionDeSecretaria.upsert({
        where: {
          businessId_telefono_simulacion: {
            businessId: mensaje.negocioId,
            telefono: mensaje.telefono,
            simulacion: mensaje.simulacion,
          },
        },
        create: {
          businessId: mensaje.negocioId,
          canalId: mensaje.canalId,
          telefono: mensaje.telefono,
          simulacion: mensaje.simulacion,
          ultimoMensajeAt: mensaje.ahora,
        },
        update: { ultimoMensajeAt: mensaje.ahora },
        select: { id: true },
      })
      await tx.mensajeDeSecretaria.create({
        data: {
          businessId: mensaje.negocioId,
          conversacionId: conversacion.id,
          rol: "user",
          contenido: [{ type: "text", text: texto }],
          waMessageId: mensaje.waMessageId ?? null,
        },
      })
      return { duplicado: false as const, conversacionId: conversacion.id }
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && mensaje.waMessageId) {
      return { duplicado: true }
    }
    throw error
  }
}

export interface Respuesta {
  /** Lo que se le respondió a la clienta, en orden. */
  respuestas: string[]
  estado: EstadoDeConversacion
  derivada: boolean
  /** Por qué no respondió, si no lo hizo. */
  sinRespuesta?: "humana" | "apagada" | "error"
}

interface Conversacion {
  id: string
  businessId: string
  telefono: string
  customerId: string | null
  estado: string
  turnos: number
  simulacion: boolean
  canal: { phoneNumberId: string; accessTokenCifrado: string; activo: boolean } | null
}

interface Negocio {
  id: string
  name: string
  timezone: string | null
  user: { email: string; name: string }
}

/** Manda un texto a la clienta: por WhatsApp, o lo junta para la pantalla del simulador. */
type Enviar = (texto: string) => Promise<void>

/**
 * Responde lo último que escribió la clienta en la conversación
 * `conversacionId` del negocio `negocioId`.
 */
export async function responder(negocioId: string, conversacionId: string, ahora: Date): Promise<Respuesta> {
  const [conversacion, negocio, guardados] = await Promise.all([
    prisma.conversacionDeSecretaria.findFirst({
      where: { id: conversacionId, businessId: negocioId },
      select: {
        id: true,
        businessId: true,
        telefono: true,
        customerId: true,
        estado: true,
        turnos: true,
        simulacion: true,
        canal: { select: { phoneNumberId: true, accessTokenCifrado: true, activo: true } },
      },
    }),
    prisma.business.findUnique({
      where: { id: negocioId },
      select: { id: true, name: true, timezone: true, user: { select: { email: true, name: true } } },
    }),
    prisma.ajustesDeSecretaria.findUnique({ where: { businessId: negocioId } }),
  ])
  if (!conversacion || !negocio) throw new Error("Conversación no encontrada")
  const ajustes = guardados ?? AJUSTES_POR_DEFECTO

  // Derivada a una persona: se guarda lo que escribe, pero la Secretaria no responde.
  if (conversacion.estado === "human") return { respuestas: [], estado: "human", derivada: false, sinRespuesta: "humana" }
  // Por WhatsApp sólo responde encendida y con el canal activo. El simulador sirve para probarla antes.
  if (!conversacion.simulacion && (!ajustes.activa || !conversacion.canal?.activo)) {
    return { respuestas: [], estado: conversacion.estado as EstadoDeConversacion, derivada: false, sinRespuesta: "apagada" }
  }
  // Una conversación cerrada que vuelve a escribir empieza de nuevo.
  if (conversacion.estado === "closed") {
    await prisma.conversacionDeSecretaria.updateMany({
      where: { id: conversacion.id, businessId: negocioId },
      data: { estado: "bot", turnos: 0 },
    })
    conversacion.estado = "bot"
    conversacion.turnos = 0
  }

  const respuestas: string[] = []
  const enviar = enviarDeLaConversacion(conversacion, respuestas)

  // Presupuesto del mes agotado: la Secretaria queda en pausa y cada consulta pasa a una persona.
  const periodo = periodoDe(ahora, zonaDelNegocio(negocio.timezone))
  const consumo = await prisma.consumoDeSecretaria.findUnique({
    where: { businessId_periodo: { businessId: negocioId, periodo } },
    select: { costoMicrodolares: true },
  })
  if (porcentajeGastado(consumo?.costoMicrodolares ?? 0, ajustes.presupuestoMensualCentavos) >= PRESUPUESTO_AGOTADO) {
    await derivar(negocio, conversacion, { motivo: "La Secretaria está en pausa: se agotó el presupuesto del mes.", memberId: null }, enviar, ahora)
    return { respuestas, estado: "human", derivada: true }
  }

  // La conversación se alargó: pasa a una persona.
  if (conversacion.turnos >= ajustes.maxTurnos) {
    await derivar(negocio, conversacion, { motivo: "La conversación se alargó sin cerrar la reserva.", memberId: null }, enviar, ahora)
    return { respuestas, estado: "human", derivada: true }
  }

  const contexto: ContextoDeHerramientas = {
    negocioId,
    conversacionId: conversacion.id,
    telefono: conversacion.telefono,
    customerId: conversacion.customerId,
    ahora,
  }

  let tokens = SIN_TOKENS
  try {
    const resultado = await conversar(negocio, conversacion, ajustes, contexto, ahora, (uso) => {
      tokens = sumarUso(tokens, uso)
    })
    if (resultado.tipo === "derivar") {
      await derivar(negocio, conversacion, resultado.pedido, enviar, ahora)
      return { respuestas, estado: "human", derivada: true }
    }
    await enviar(resultado.texto)
    await prisma.conversacionDeSecretaria.updateMany({
      where: { id: conversacion.id, businessId: negocioId },
      data: { turnos: { increment: 1 }, ultimoMensajeAt: ahora },
    })
    return { respuestas, estado: "bot", derivada: false }
  } catch (error) {
    registrarError("respondiendo con la Secretaria Eli", error)
    return { respuestas, estado: conversacion.estado as EstadoDeConversacion, derivada: false, sinRespuesta: "error" }
  } finally {
    await registrarConsumo(negocio, ajustes.presupuestoMensualCentavos, periodo, tokens, respuestas.length, conversacion.simulacion, ahora)
  }
}

function enviarDeLaConversacion(conversacion: Conversacion, respuestas: string[]): Enviar {
  return async (texto) => {
    if (!conversacion.simulacion) {
      if (!conversacion.canal) throw new Error("Conversación de WhatsApp sin canal")
      await enviarTextoPorWhatsapp({
        phoneNumberId: conversacion.canal.phoneNumberId,
        accessToken: descifrarToken(conversacion.canal.accessTokenCifrado),
        para: conversacion.telefono,
        texto,
      })
    }
    respuestas.push(texto)
    await prisma.mensajeDeSecretaria.create({
      data: {
        businessId: conversacion.businessId,
        conversacionId: conversacion.id,
        rol: "assistant",
        contenido: [{ type: "text", text: texto }],
      },
    })
  }
}

type FinDeLaConversacion = { tipo: "texto"; texto: string } | { tipo: "derivar"; pedido: PedidoDeDerivacion }

/** El historial para el modelo: los últimos mensajes, empezando por uno de texto de la clienta. */
export function historialParaElModelo(
  filas: { rol: string; contenido: Prisma.JsonValue }[]
): Anthropic.MessageParam[] {
  const mensajes = filas.map((fila) => ({
    role: fila.rol === "assistant" ? ("assistant" as const) : ("user" as const),
    content: fila.contenido as unknown as Anthropic.ContentBlockParam[],
  }))
  // Un recorte puede dejar al principio una respuesta o un resultado de
  // herramienta sin la llamada que lo pidió: la API los rechaza.
  const inicio = mensajes.findIndex(
    (mensaje) =>
      mensaje.role === "user" &&
      Array.isArray(mensaje.content) &&
      mensaje.content.every((bloque) => bloque.type === "text")
  )
  return inicio === -1 ? [] : mensajes.slice(inicio)
}

async function conversar(
  negocio: Negocio,
  conversacion: Conversacion,
  ajustes: { maxTokens: number; reglas: string | null },
  contexto: ContextoDeHerramientas,
  ahora: Date,
  alUsar: (uso: Anthropic.Usage) => void
): Promise<FinDeLaConversacion> {
  const [prompt, ultimos] = await Promise.all([
    promptDelNegocio(negocio.id, ajustes.reglas),
    prisma.mensajeDeSecretaria.findMany({
      where: { conversacionId: conversacion.id, businessId: negocio.id },
      orderBy: { createdAt: "desc" },
      take: MENSAJES_DE_HISTORIAL,
      select: { rol: true, contenido: true },
    }),
  ])
  const mensajes = historialParaElModelo(ultimos.reverse())
  if (mensajes.length === 0) throw new Error("Conversación sin mensaje de la clienta")

  // Herramientas y system prompt cacheados (son lo mismo en cada mensaje del
  // negocio); la fecha de hoy va en un bloque aparte, después del caché.
  const herramientas: Anthropic.Tool[] = HERRAMIENTAS.map((herramienta, i) =>
    i === HERRAMIENTAS.length - 1 ? { ...herramienta, cache_control: { type: "ephemeral" } } : herramienta
  )
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: prompt, cache_control: { type: "ephemeral" } },
    { type: "text", text: bloqueDeHoy(ahora, negocio.timezone) },
  ]

  for (let vuelta = 0; vuelta < MAX_VUELTAS_DE_HERRAMIENTAS; vuelta++) {
    const respuesta = await clienteDelModelo().messages.create({
      model: MODELO_DE_LA_SECRETARIA,
      max_tokens: ajustes.maxTokens,
      // Sin razonamiento: con 200 tokens de salida no queda lugar para él.
      thinking: { type: "disabled" },
      system,
      tools: herramientas,
      messages: mensajes,
    })
    alUsar(respuesta.usage)

    if (respuesta.stop_reason === "refusal") {
      return { tipo: "derivar", pedido: { motivo: "La Secretaria no pudo atender esta consulta.", memberId: null } }
    }

    const llamadas = respuesta.content.filter((bloque): bloque is Anthropic.ToolUseBlock => bloque.type === "tool_use")
    const texto = respuesta.content
      .filter((bloque): bloque is Anthropic.TextBlock => bloque.type === "text")
      .map((bloque) => bloque.text)
      .join("\n")
      .trim()

    if (llamadas.length === 0 || respuesta.stop_reason !== "tool_use") {
      if (!texto) return { tipo: "derivar", pedido: { motivo: "La Secretaria no supo qué responder.", memberId: null } }
      return { tipo: "texto", texto }
    }

    // Se guardan la llamada y sus resultados, para que el historial quede completo.
    const contenidoDelModelo = respuesta.content as unknown as Prisma.InputJsonValue
    await prisma.mensajeDeSecretaria.create({
      data: {
        businessId: negocio.id,
        conversacionId: conversacion.id,
        rol: "assistant",
        contenido: contenidoDelModelo,
        tokensEntrada: tokensDeEntrada(sumarUso(SIN_TOKENS, respuesta.usage)),
        tokensSalida: respuesta.usage.output_tokens,
      },
    })

    const resultados: Anthropic.ToolResultBlockParam[] = []
    let derivacion: PedidoDeDerivacion | null = null
    for (const llamada of llamadas) {
      const resultado = await ejecutarHerramienta(llamada.name, llamada.input, contexto).catch((error) => {
        registrarError(`corriendo la herramienta ${llamada.name} de la Secretaria`, error)
        return { contenido: { error: "No se pudo completar. Intenta de nuevo o deriva." }, esError: true }
      })
      if ("derivar" in resultado && resultado.derivar) derivacion = resultado.derivar
      resultados.push({
        type: "tool_result",
        tool_use_id: llamada.id,
        content: JSON.stringify(resultado.contenido),
        ...(resultado.esError && { is_error: true }),
      })
    }
    await prisma.mensajeDeSecretaria.create({
      data: {
        businessId: negocio.id,
        conversacionId: conversacion.id,
        rol: "user",
        contenido: resultados as unknown as Prisma.InputJsonValue,
      },
    })
    if (derivacion) return { tipo: "derivar", pedido: derivacion }

    mensajes.push({ role: "assistant", content: respuesta.content }, { role: "user", content: resultados })
  }

  return { tipo: "derivar", pedido: { motivo: "La Secretaria no alcanzó a resolver la consulta.", memberId: null } }
}

/** El primer nombre de una persona, para el mensaje a la clienta. */
function primerNombre(nombre: string | null | undefined): string | null {
  const primero = nombre?.trim().split(/\s+/)[0]
  return primero || null
}

const TEXTO_DE_MENSAJES_EN_EL_RESUMEN = 6

/** Los últimos mensajes de texto de la conversación, para el aviso a quien atiende. */
async function resumenDeLaConversacion(negocioId: string, conversacionId: string): Promise<string> {
  const filas = await prisma.mensajeDeSecretaria.findMany({
    where: { conversacionId, businessId: negocioId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { rol: true, contenido: true },
  })
  const lineas: string[] = []
  for (const fila of filas) {
    const bloques = Array.isArray(fila.contenido) ? (fila.contenido as { type?: string; text?: string }[]) : []
    const texto = bloques
      .filter((bloque) => bloque?.type === "text" && typeof bloque.text === "string")
      .map((bloque) => bloque.text)
      .join(" ")
      .trim()
    if (texto) lineas.push(`${fila.rol === "assistant" ? "Eli" : "Clienta"}: ${texto}`)
    if (lineas.length >= TEXTO_DE_MENSAJES_EN_EL_RESUMEN) break
  }
  return lineas.reverse().join(" · ")
}

function enlaceAlPanel(): string | null {
  try {
    return `${urlBase()}/dashboard/secretaria`
  } catch {
    return null
  }
}

/** Pasa la conversación a una persona: lo dice a la clienta, la marca y avisa por correo y en el panel. */
async function derivar(
  negocio: Negocio,
  conversacion: Conversacion,
  pedido: PedidoDeDerivacion,
  enviar: Enviar,
  ahora: Date
): Promise<void> {
  const miembro = pedido.memberId
    ? await prisma.businessMember.findFirst({
        where: { id: pedido.memberId, businessId: negocio.id },
        select: { id: true, user: { select: { name: true } } },
      })
    : null
  const memberId = miembro?.id ?? null
  const nombre = primerNombre(miembro?.user.name) ?? primerNombre(negocio.user.name) ?? "el equipo"

  await prisma.conversacionDeSecretaria.updateMany({
    where: { id: conversacion.id, businessId: negocio.id },
    data: { estado: "human", motivoDerivacion: pedido.motivo, derivadaAMemberId: memberId, derivadaAt: ahora },
  })
  conversacion.estado = "human"

  // A la clienta primero: si el aviso falla, igual sabe que le van a responder.
  await enviar(mensajeDeDerivacion(nombre)).catch((error) => registrarError("avisando la derivación a la clienta", error))

  // El simulador no avisa a nadie: es una prueba.
  if (conversacion.simulacion) return

  const [clienta, resumen] = await Promise.all([
    conversacion.customerId
      ? prisma.customer.findFirst({
          where: { id: conversacion.customerId, businessId: negocio.id },
          select: { name: true, lastName: true },
        })
      : null,
    resumenDeLaConversacion(negocio.id, conversacion.id),
  ])
  const nombreCliente = clienta ? [clienta.name, clienta.lastName].filter(Boolean).join(" ") : null

  await prisma.avisoDelPanel
    .create({
      data: {
        businessId: negocio.id,
        memberId,
        tipo: "derivacion",
        titulo: `Consulta de WhatsApp: ${nombreCliente ?? conversacion.telefono}`,
        cuerpo: `${pedido.motivo} Teléfono: ${conversacion.telefono}.`,
        enlace: "/dashboard/secretaria",
      },
    })
    .catch((error) => registrarError("guardando el aviso de derivación", error))

  const para = (await correoDelProfesional(negocio.id, memberId)) ?? negocio.user.email
  await enviarDerivacionDeSecretaria({
    para,
    nombreNegocio: negocio.name,
    nombreCliente,
    telefono: conversacion.telefono,
    motivo: pedido.motivo,
    resumen,
    enlace: enlaceAlPanel(),
  }).catch((error) => registrarError("mandando el correo de derivación", error))
}

/** Suma lo gastado al mes y avisa una sola vez al 80 % y al 100 %. El simulador también cuenta: es plata real. */
async function registrarConsumo(
  negocio: Negocio,
  presupuestoCentavos: number,
  periodo: string,
  tokens: TokensSumados,
  respuestas: number,
  simulacion: boolean,
  ahora: Date
): Promise<void> {
  const costo = costoEnMicrodolares(tokens)
  const enviados = simulacion ? 0 : respuestas
  if (costo === 0 && enviados === 0) return
  try {
    const consumo = await prisma.consumoDeSecretaria.upsert({
      where: { businessId_periodo: { businessId: negocio.id, periodo } },
      create: {
        businessId: negocio.id,
        periodo,
        tokensEntrada: tokensDeEntrada(tokens),
        tokensSalida: tokens.salida,
        costoMicrodolares: costo,
        mensajesWhatsappEnviados: enviados,
      },
      update: {
        tokensEntrada: { increment: tokensDeEntrada(tokens) },
        tokensSalida: { increment: tokens.salida },
        costoMicrodolares: { increment: costo },
        mensajesWhatsappEnviados: { increment: enviados },
      },
      select: { costoMicrodolares: true },
    })
    const porcentaje = porcentajeGastado(consumo.costoMicrodolares, presupuestoCentavos)
    if (porcentaje >= PRESUPUESTO_AGOTADO) await alertar(negocio, periodo, PRESUPUESTO_AGOTADO, ahora)
    if (porcentaje >= ALERTA_DE_PRESUPUESTO) await alertar(negocio, periodo, ALERTA_DE_PRESUPUESTO, ahora)
  } catch (error) {
    registrarError("registrando el consumo de la Secretaria", error)
  }
}

/** Marca la alerta del mes (una sola vez, aunque lleguen dos mensajes a la vez) y avisa a la dueña. */
async function alertar(negocio: Negocio, periodo: string, porcentaje: number, ahora: Date): Promise<void> {
  const campo = porcentaje >= PRESUPUESTO_AGOTADO ? "alerta100At" : "alerta80At"
  const marcada = await prisma.consumoDeSecretaria.updateMany({
    where: { businessId: negocio.id, periodo, [campo]: null },
    data: { [campo]: ahora },
  })
  if (marcada.count === 0) return
  const agotado = porcentaje >= PRESUPUESTO_AGOTADO
  await prisma.avisoDelPanel.create({
    data: {
      businessId: negocio.id,
      memberId: null,
      tipo: agotado ? "presupuesto-100" : "presupuesto-80",
      titulo: agotado ? "La Secretaria se pausó por presupuesto" : "La Secretaria usó el 80 % del presupuesto",
      cuerpo: agotado
        ? "Hasta el mes que viene, cada consulta nueva de WhatsApp pasa a una persona."
        : "Si llega al 100 %, se pausa hasta el mes que viene.",
      enlace: "/dashboard/secretaria",
    },
  })
  await enviarPresupuestoDeSecretaria({
    para: negocio.user.email,
    nombreNegocio: negocio.name,
    porcentaje,
    enlace: enlaceAlPanel(),
  }).catch((error) => registrarError("mandando la alerta de presupuesto de la Secretaria", error))
}
