/**
 * Todo lo que la vista de chats le pide al servidor. La pantalla llama a estas
 * funciones y no conoce ninguna URL.
 *
 * Cada función devuelve un `Resultado` (`lib/peticiones.ts`) en vez de lanzar:
 * la pantalla está obligada a decidir qué mostrar cuando algo falla, también
 * cuando un mensaje no se envía.
 */

import { pedir, conJson, type Resultado } from "@/lib/peticiones"

export interface Mensaje {
  id: string
  content: string
  /** `true` si lo escribió el negocio; `false` si lo escribió el cliente. */
  fromBusiness: boolean
  createdAt: string
}

export interface Conversacion {
  id: string
  customerName: string
  customerPhone: string | null
  updatedAt: string
  /** En el listado viene sólo el último, para la vista previa. */
  messages: Mensaje[]
}

export interface DatosDeNuevaConversacion {
  nombre: string
  telefono: string
}

/** Las conversaciones del negocio, la de actividad más reciente primero. */
export async function leerConversaciones(): Promise<Resultado<Conversacion[]>> {
  return pedir<Conversacion[]>("/api/chats", "No se pudieron cargar las conversaciones")
}

/** Al abrir una conversación: sus mensajes, del más viejo al más nuevo. */
export async function leerMensajes(conversacionId: string): Promise<Resultado<Mensaje[]>> {
  const resultado = await pedir<Conversacion>(`/api/chats/${conversacionId}`, "No se pudo abrir la conversación")
  return resultado.ok ? { ok: true, datos: resultado.datos.messages } : resultado
}

/** Devuelve el mensaje como quedó guardado, con su id y su hora. */
export async function enviarMensaje(conversacionId: string, texto: string): Promise<Resultado<Mensaje>> {
  return pedir<Mensaje>(
    `/api/chats/${conversacionId}/mensajes`,
    "No se pudo enviar el mensaje",
    conJson("POST", { content: texto })
  )
}

export async function crearConversacion(datos: DatosDeNuevaConversacion): Promise<Resultado<Conversacion>> {
  return pedir<Conversacion>(
    "/api/chats",
    "No se pudo crear la conversación",
    conJson("POST", {
      customerName: datos.nombre,
      customerPhone: datos.telefono || undefined,
    })
  )
}
