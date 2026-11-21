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
 * minuto. Devuelve el id del mensaje en WhatsApp.
 */
export async function enviarPorWhatsapp(negocioId: string, jid: string, texto: string): Promise<string | null> {
  const conexion = conexiones.get(negocioId)
  if (!conexion?.abierta) throw new WhatsappNoConectado()

  // Tope por minuto: si se llenó, espera a que se libere un lugar.
  const ahora = Date.now()
  conexion.envios = conexion.envios.filter((t) => ahora - t < 60_000)
  if (conexion.envios.length >= TOPE_DE_MENSAJES_POR_MINUTO) {
    await esperar(60_000 - (ahora - conexion.envios[0]))
  }
  conexion.envios.push(Date.now())

  const { socket } = conexion
  await socket.sendPresenceUpdate("composing", jid).catch(() => {})
  await esperar(pausaAntesDeEnviar(texto))
  await socket.sendPresenceUpdate("paused", jid).catch(() => {})
  if (!conexion.abierta) throw new WhatsappNoConectado()
  const enviado = await socket.sendMessage(jid, { text: texto })
  const id = enviado?.key.id ?? null
  if (id) conexion.enviados.add(id)
  return id
}
