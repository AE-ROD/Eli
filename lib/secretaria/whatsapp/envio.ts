import { conexiones } from "@/lib/secretaria/whatsapp/registro"
import { pausaAntesDeEnviar } from "@/lib/secretaria/whatsapp/entrantes"

/** Cuántos mensajes puede mandar la Secretaria por minuto en un número. */
export const TOPE_DE_MENSAJES_POR_MINUTO = 12

export class WhatsappNoConectado extends Error {
  constructor() {
    super("El WhatsApp del negocio no está conectado")
  }
}

const esperar = (ms: number) => new Promise<void>((listo) => setTimeout(listo, ms))

/**
 * Manda un texto por el WhatsApp del negocio, a ritmo de persona: muestra
 * "escribiendo…", espera según el largo, y respeta un tope de mensajes por
 * minuto. Justo antes de mandar pregunta `sigue()`: si la dueña tomó el chat
 * mientras "escribía", no lo manda y devuelve null. Si lo manda, devuelve
 * `{ id }` con el id del mensaje en WhatsApp.
 */
export async function enviarPorWhatsapp(
  negocioId: string,
  jid: string,
  texto: string,
  sigue: () => Promise<boolean> = async () => true
): Promise<{ id: string | null } | null> {
  const conexion = conexiones.get(negocioId)
  if (!conexion?.abierta) throw new WhatsappNoConectado()

  // Tope por minuto: el turno se reserva de una (sin esperas antes), así dos
  // envíos a la vez no toman el mismo lugar.
  const ahora = Date.now()
  conexion.envios = conexion.envios.filter((t) => t > ahora - 60_000)
  const turno =
    conexion.envios.length >= TOPE_DE_MENSAJES_POR_MINUTO
      ? Math.max(ahora, conexion.envios[conexion.envios.length - TOPE_DE_MENSAJES_POR_MINUTO] + 60_000)
      : ahora
  conexion.envios.push(turno)
  if (turno > ahora) await esperar(turno - ahora)

  const { socket } = conexion
  await socket.sendPresenceUpdate("composing", jid).catch(() => {})
  await esperar(pausaAntesDeEnviar(texto))
  await socket.sendPresenceUpdate("paused", jid).catch(() => {})
  if (!conexion.abierta) throw new WhatsappNoConectado()
  if (!(await sigue())) return null
  const enviado = await socket.sendMessage(jid, { text: texto })
  const id = enviado?.key.id ?? null
  if (id) conexion.enviados.add(id)
  return { id }
}
