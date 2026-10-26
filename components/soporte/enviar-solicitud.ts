import { conJson, pedirConCodigo } from "@/lib/peticiones"
import type { CuerpoDeSolicitudDeSoporte, RespuestaDeSolicitudDeSoporte } from "@/lib/soporte"

/**
 * Lo que el centro de ayuda le pide al servidor: mandar una solicitud
 * (`POST /api/soporte`). Devuelve el número de caso o por qué no se pudo, con
 * el código: un 429 se explica distinto que un 400.
 */
export function enviarSolicitud(cuerpo: CuerpoDeSolicitudDeSoporte) {
  return pedirConCodigo<RespuestaDeSolicitudDeSoporte>(
    "/api/soporte",
    "No pudimos enviar tu mensaje. Inténtalo de nuevo en unos minutos.",
    conJson("POST", cuerpo)
  )
}

/** El mensaje que ve la persona cuando el envío falla. Lo que escribió no se pierde: lo dice. */
export function mensajeDeErrorDeEnvio(error: string, codigo: number | null): string {
  if (codigo === null) {
    return "No pudimos conectarnos. Revisa tu conexión e inténtalo de nuevo; lo que escribiste sigue aquí."
  }
  if (codigo === 429) {
    return "Recibimos varios mensajes seguidos. Espera unos minutos y vuelve a intentarlo; lo que escribiste sigue aquí."
  }
  return error
}
