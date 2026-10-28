import {
  TOPE_ENVIOS_POR_CORRIDA,
  resumenVacio,
  type ContextoDeCorrida,
  type ResumenDeTrabajo,
} from "@/lib/envios-a-clientes"
import { expirarListaDeEspera } from "@/lib/lista-de-espera"
import { ejecutarTeToca } from "@/lib/te-toca"
import { ejecutarResenas } from "@/lib/resenas"
import { registrarError } from "@/lib/registro-de-errores"

/**
 * (servidor) La corrida diaria de los mensajes a clientes: expira la lista de
 * espera, manda "te toca" y pide reseñas, en ese orden. La llaman el cron
 * diario de correos de prueba (`/api/cron/correos-de-prueba`, que está en
 * `vercel.json`) al terminar lo suyo, y `/api/cron/mensajes-a-clientes` para
 * correrla a mano. No tiene entrada propia en `vercel.json`: el plan Hobby de
 * Vercel ya tiene dos crons.
 *
 * Los trabajos comparten un cupo de envíos (`TOPE_ENVIOS_POR_CORRIDA`) y un
 * plazo (`hasta`). Uno que lanza no corta a los demás: se registra y su
 * resumen sale con `error`. Nunca lanza.
 */

export interface ResumenDeMensajes {
  listaDeEspera: ResumenDeTrabajo & { error?: true }
  teToca: ResumenDeTrabajo & { error?: true }
  resenas: ResumenDeTrabajo & { error?: true }
  incompleto: boolean
}

async function correr(
  nombre: string,
  trabajo: (contexto: ContextoDeCorrida) => Promise<ResumenDeTrabajo>,
  contexto: ContextoDeCorrida
): Promise<ResumenDeTrabajo & { error?: true }> {
  if (Date.now() > contexto.hasta) return { ...resumenVacio(), incompleto: true }
  try {
    return await trabajo(contexto)
  } catch (error) {
    registrarError(`en el cron de mensajes a clientes (${nombre})`, error)
    return { ...resumenVacio(), incompleto: true, error: true }
  }
}

export async function ejecutarMensajesAClientes({ ahora, hasta }: { ahora: Date; hasta: number }): Promise<ResumenDeMensajes> {
  const contexto: ContextoDeCorrida = { ahora, hasta, cupo: { restantes: TOPE_ENVIOS_POR_CORRIDA } }

  const listaDeEspera = await correr("lista de espera", expirarListaDeEspera, contexto)
  const teToca = await correr("te toca", ejecutarTeToca, contexto)
  const resenas = await correr("reseñas", ejecutarResenas, contexto)

  return {
    listaDeEspera,
    teToca,
    resenas,
    incompleto: listaDeEspera.incompleto || teToca.incompleto || resenas.incompleto,
  }
}
