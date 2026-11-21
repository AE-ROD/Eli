import {
  getContentType,
  isJidBroadcast,
  isJidGroup,
  isJidNewsletter,
  isLidUser,
  isPnUser,
  jidDecode,
  normalizeMessageContent,
  type proto,
} from "baileys"

/**
 * Qué hacer con lo que llega por WhatsApp. Funciones puras, sin conexión ni
 * base, para probarlas solas (`entrantes.test.ts`).
 */

/** Sólo chats uno a uno: ni grupos, ni estados, ni listas de difusión, ni canales. */
export function esChatUnoAUno(jid: string | null | undefined): jid is string {
  if (!jid) return false
  if (isJidGroup(jid) || isJidBroadcast(jid) || isJidNewsletter(jid)) return false
  return Boolean(isPnUser(jid) || isLidUser(jid))
}

/** `56912345678@s.whatsapp.net` → `+56912345678`. Null si no es un número de teléfono. */
export function telefonoDelJid(jid: string | null | undefined): string | null {
  if (!jid || !isPnUser(jid)) return null
  const usuario = jidDecode(jid)?.user ?? ""
  return /^\d{8,15}$/.test(usuario) ? `+${usuario}` : null
}

/** Tipos de mensaje que no son de la clienta sino del sistema: no se responden. */
const DE_SISTEMA = new Set<string>([
  "protocolMessage",
  "reactionMessage",
  "senderKeyDistributionMessage",
  "pollUpdateMessage",
  "keepInChatMessage",
  "editedMessage",
  "messageContextInfo",
  "callLogMesssage",
  "pinInChatMessage",
  "encReactionMessage",
])

export type Contenido = { tipo: "texto"; texto: string } | { tipo: "otro" } | { tipo: "ignorar" }

/**
 * El contenido de un mensaje: texto, otra cosa (audio, foto, sticker... que la
 * Secretaria no lee) o algo del sistema que no se contesta.
 */
export function contenidoDelMensaje(mensaje: proto.IMessage | null | undefined): Contenido {
  const contenido = normalizeMessageContent(mensaje)
  const tipo = getContentType(contenido)
  if (!contenido || !tipo || DE_SISTEMA.has(tipo)) return { tipo: "ignorar" }
  const texto =
    tipo === "conversation" ? contenido.conversation : tipo === "extendedTextMessage" ? contenido.extendedTextMessage?.text : null
  if (texto?.trim()) return { tipo: "texto", texto }
  return { tipo: "otro" }
}

/** Un mensaje más viejo que esto (p. ej. lo que llega al reconectarse tras horas) no se responde. */
export const ANTIGUEDAD_MAXIMA_MS = 10 * 60_000

export function esReciente(timestamp: number | Long | null | undefined, ahora: Date): boolean {
  if (timestamp === null || timestamp === undefined) return true
  const segundos = typeof timestamp === "number" ? timestamp : Number(timestamp.toString())
  return ahora.getTime() - segundos * 1000 <= ANTIGUEDAD_MAXIMA_MS
}

type Long = { toString(): string }

/**
 * Cuánto "escribe" la Secretaria antes de mandar un mensaje, como una persona:
 * más largo el mensaje, más tarda, entre 1,5 y 7 segundos.
 */
export function pausaAntesDeEnviar(texto: string): number {
  return Math.min(7_000, Math.max(1_500, 1_000 + texto.length * 40))
}
