import { createHmac, timingSafeEqual } from "node:crypto"
import { z } from "zod"
import { versionDeGraph } from "@/lib/secretaria/config"

/**
 * WhatsApp Cloud API: la firma del webhook, el formato de los mensajes
 * entrantes y el envío de una respuesta por la Graph API.
 */

/**
 * Si `X-Hub-Signature-256` ("sha256=<hex>") es el HMAC-SHA256 del cuerpo crudo
 * con `WHATSAPP_APP_SECRET`. Sin secreto configurado falla cerrado.
 */
export function firmaValida(cuerpoCrudo: Uint8Array, cabecera: string | null): boolean {
  const secreto = process.env.WHATSAPP_APP_SECRET
  if (!secreto || !cabecera?.startsWith("sha256=")) return false
  const esperada = createHmac("sha256", secreto).update(cuerpoCrudo).digest()
  const recibida = Buffer.from(cabecera.slice("sha256=".length), "hex")
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada)
}

/** La verificación del webhook (GET): devuelve el `hub.challenge` si el token coincide. */
export function respuestaDeVerificacion(parametros: URLSearchParams): string | null {
  const token = process.env.WHATSAPP_VERIFY_TOKEN
  if (!token) return null
  const recibido = parametros.get("hub.verify_token") ?? ""
  const iguales =
    recibido.length === token.length && timingSafeEqual(Buffer.from(recibido, "utf8"), Buffer.from(token, "utf8"))
  if (parametros.get("hub.mode") !== "subscribe" || !iguales) return null
  return parametros.get("hub.challenge")
}

/** Sólo la parte del payload que se usa. Lo demás (estados de entrega, etc.) se ignora. */
const payloadSchema = z.object({
  entry: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        changes: z
          .array(
            z.object({
              value: z.object({
                metadata: z.object({ phone_number_id: z.string().min(1).max(64) }).optional(),
                messages: z
                  .array(
                    z.object({
                      id: z.string().min(1).max(256),
                      from: z.string().min(1).max(32),
                      type: z.string(),
                      text: z.object({ body: z.string() }).optional(),
                    })
                  )
                  .optional(),
              }),
            })
          )
          .default([]),
      })
    )
    .default([]),
})

export interface MensajeEntrante {
  /** La cuenta de WhatsApp Business (`entry[].id`): tiene que ser la del canal. */
  wabaId: string
  phoneNumberId: string
  waMessageId: string
  /** En E.164, con "+". */
  telefono: string
  /** El texto, o null si no es un mensaje de texto (audio, foto, ...). */
  texto: string | null
}

/** Los mensajes entrantes de un payload del webhook. Un payload que no se entiende no trae ninguno. */
export function mensajesDelPayload(cuerpo: unknown): MensajeEntrante[] {
  const leido = payloadSchema.safeParse(cuerpo)
  if (!leido.success) return []
  const mensajes: MensajeEntrante[] = []
  for (const entrada of leido.data.entry) {
    for (const cambio of entrada.changes) {
      const phoneNumberId = cambio.value.metadata?.phone_number_id
      if (!phoneNumberId) continue
      for (const mensaje of cambio.value.messages ?? []) {
        const digitos = mensaje.from.replace(/\D/g, "")
        if (!digitos) continue
        mensajes.push({
          wabaId: entrada.id,
          phoneNumberId,
          waMessageId: mensaje.id,
          telefono: `+${digitos}`,
          texto: mensaje.type === "text" ? (mensaje.text?.body ?? null) : null,
        })
      }
    }
  }
  return mensajes
}

export class EnvioDeWhatsappFallido extends Error {
  constructor(public readonly status: number) {
    super(`La Graph API respondió ${status}`)
  }
}

/** Manda un mensaje de texto por la Graph API. Lanza si Meta no lo acepta. */
export async function enviarTextoPorWhatsapp(canal: {
  phoneNumberId: string
  accessToken: string
  para: string
  texto: string
}): Promise<void> {
  const url = `https://graph.facebook.com/${versionDeGraph()}/${encodeURIComponent(canal.phoneNumberId)}/messages`
  const respuesta = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${canal.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: canal.para.replace(/^\+/, ""),
      type: "text",
      text: { body: canal.texto },
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!respuesta.ok) throw new EnvioDeWhatsappFallido(respuesta.status)
}

/**
 * Si Meta confirma que el número `phoneNumberId` es de la cuenta `wabaId`,
 * preguntando con el token que entregó el negocio: así un negocio no puede
 * conectar el número de otro sabiendo sólo su id. Un token sin acceso a esa
 * cuenta es `false`; si Meta no contesta, lanza.
 */
export async function numeroEsDeLaCuenta(canal: { wabaId: string; phoneNumberId: string; accessToken: string }): Promise<boolean> {
  const url = `https://graph.facebook.com/${versionDeGraph()}/${encodeURIComponent(canal.wabaId)}/phone_numbers?fields=id&limit=100`
  const respuesta = await fetch(url, {
    headers: { Authorization: `Bearer ${canal.accessToken}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (respuesta.status >= 500) throw new EnvioDeWhatsappFallido(respuesta.status)
  if (!respuesta.ok) return false
  const cuerpo = (await respuesta.json().catch(() => null)) as { data?: { id?: unknown }[] } | null
  return Array.isArray(cuerpo?.data) && cuerpo.data.some((numero) => numero?.id === canal.phoneNumberId)
}
