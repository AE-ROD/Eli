/**
 * Lo que la pantalla de la Secretaria le pide al servidor desde el navegador:
 * el simulador, los ajustes, conectar el WhatsApp y devolver una conversación
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

/** Cómo está el WhatsApp del negocio. */
export type EstadoDeConexion = "desconectado" | "esperando_qr" | "conectado"

/** Lo que contesta `/api/secretaria/whatsapp`. */
export interface EstadoDelWhatsapp {
  estado: EstadoDeConexion
  /** E.164, o `null` hasta que se escanea el código. */
  numero: string | null
  motivoDesconexion: string | null
  condicionesAceptadas: boolean
  /** La imagen del código para escanear (data URL). Sólo a la dueña y mientras se espera. */
  qr: string | null
}

/** Un estado que no se conoce cuenta como desconectado: falla cerrado. */
export function estadoDelWhatsapp(valor: string | null | undefined): EstadoDeConexion {
  return valor === "esperando_qr" || valor === "conectado" ? valor : "desconectado"
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

export function leerElWhatsapp(): Promise<Resultado<EstadoDelWhatsapp>> {
  return pedir<EstadoDelWhatsapp>("/api/secretaria/whatsapp", "No se pudo ver el estado de tu WhatsApp", {
    cache: "no-store",
  })
}

export function conectarElWhatsapp(): Promise<Resultado<EstadoDelWhatsapp>> {
  return pedir<EstadoDelWhatsapp>(
    "/api/secretaria/whatsapp",
    "No se pudo empezar la conexión. Intenta de nuevo.",
    conJson("POST", { aceptoLasCondiciones: true })
  )
}

export function desconectarElWhatsapp(): Promise<Resultado<EstadoDelWhatsapp>> {
  return pedir<EstadoDelWhatsapp>("/api/secretaria/whatsapp", "No se pudo desconectar. Intenta de nuevo.", {
    method: "DELETE",
  })
}
