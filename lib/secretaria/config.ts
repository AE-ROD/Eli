/**
 * Configuración de la Secretaria Eli: el modelo, lo que cuesta y los topes
 * fijos. Lo que cambia por negocio está en `AjustesDeSecretaria`.
 *
 * Variables de entorno (todas del servidor, ninguna llega al navegador):
 * - `ANTHROPIC_API_KEY`: la llave de la API de Anthropic.
 * - `WHATSAPP_VERIFY_TOKEN`: el token de verificación del webhook en Meta.
 * - `WHATSAPP_APP_SECRET`: el secreto de la app de Meta, para la firma.
 * - `WHATSAPP_GRAPH_VERSION`: la versión de la Graph API (p. ej. "v21.0").
 * - `WHATSAPP_TOKEN_KEY`: 32 bytes en base64 para cifrar los tokens de acceso.
 */

export const MODELO_DE_LA_SECRETARIA = "claude-haiku-5-5"

/**
 * Precio del modelo en USD por millón de tokens (tabla de Anthropic para
 * Claude Haiku 5.5, prompts de hasta 100K tokens). Escribir en el caché cuesta
 * 1,25 veces la entrada y leerlo se estima en 0,1 veces (conservador: si la tabla
 * oficial cobra menos, el presupuesto se agota antes de lo real, nunca después).
 */
export const PRECIO_USD_POR_MILLON = {
  entrada: 0.1,
  salida: 0.5,
  escrituraDeCache: 0.125,
  lecturaDeCache: 0.01,
} as const

/** Cuántos mensajes guardados se le mandan al modelo como historial. */
export const MENSAJES_DE_HISTORIAL = 10

/** Cuántas vueltas de herramientas puede dar el modelo para responder un mensaje. */
export const MAX_VUELTAS_DE_HERRAMIENTAS = 4

/** Cuántos horarios ofrece `ver_disponibilidad`. */
export const MAX_HORARIOS_OFRECIDOS = 3

/** Largo máximo de un mensaje entrante que se le pasa al modelo. */
export const LARGO_MAXIMO_DEL_MENSAJE = 1000

/** Porcentajes del presupuesto mensual en que se avisa a la dueña. */
export const ALERTA_DE_PRESUPUESTO = 80
export const PRESUPUESTO_AGOTADO = 100

export const ESTADOS_DE_CONVERSACION = ["bot", "human", "closed"] as const
export type EstadoDeConversacion = (typeof ESTADOS_DE_CONVERSACION)[number]

export function versionDeGraph(): string {
  const version = process.env.WHATSAPP_GRAPH_VERSION?.trim()
  return version && /^v\d+\.\d+$/.test(version) ? version : "v21.0"
}
