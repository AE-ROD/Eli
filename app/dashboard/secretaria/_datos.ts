/**
 * Lo que la pantalla de la Secretaria le pide al servidor desde el navegador:
 * el simulador, los ajustes, el número de WhatsApp y devolver una conversación
 * derivada. Lo que se ve al entrar ya viene resuelto por `page.tsx` (con
 * `_lecturas.ts`), que es de servidor.
 *
 * Cada función devuelve un `Resultado` (`lib/peticiones.ts`): nunca lanza.
 */

import { conJson, pedir, type Resultado } from "@/lib/peticiones"

export type EstadoDeLaConversacion = "bot" | "human" | "closed"

/** Lo que contesta el simulador a un mensaje de la clienta de prueba. */
export interface RespuestaDelSimulador {
  respuestas: string[]
  estado: EstadoDeLaConversacion
  derivada: boolean
  /** Por qué no respondió: la conversación ya está con una persona, la Secretaria está apagada o falló. */
  sinRespuesta?: "humana" | "apagada" | "error" | "ocupada"
}

export interface AjustesParaGuardar {
  activa: boolean
  maxTurnos: number
  maxTokens: number
  reglas: string | null
}

export function enviarAlSimulador(telefono: string, mensaje: string): Promise<Resultado<RespuestaDelSimulador>> {
  return pedir<RespuestaDelSimulador>(
    "/api/secretaria/simulador",
    "Eli no pudo responder. Intenta de nuevo.",
    conJson("POST", { telefono, mensaje })
  )
}

export function reiniciarSimulador(telefono: string): Promise<Resultado<unknown>> {
  return pedir<unknown>(
    `/api/secretaria/simulador?telefono=${encodeURIComponent(telefono)}`,
    "No se pudo empezar de nuevo",
    { method: "DELETE" }
  )
}

export function guardarAjustes(ajustes: AjustesParaGuardar): Promise<Resultado<unknown>> {
  return pedir<unknown>("/api/secretaria/ajustes", "No se pudieron guardar los ajustes", conJson("PUT", ajustes))
}

export function devolverAEli(conversacionId: string): Promise<Resultado<unknown>> {
  return pedir<unknown>(
    `/api/secretaria/conversaciones/${encodeURIComponent(conversacionId)}/devolver`,
    "No se pudo devolver la conversación a Eli",
    { method: "POST" }
  )
}
