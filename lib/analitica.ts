import type { BeforeSendEvent } from "@vercel/analytics/next"

/**
 * Rutas cuyo segundo segmento es un token de un solo uso: el enlace de
 * restablecer la contraseña y el de unirse a un equipo. Sólo esas, y sólo en
 * la raíz: `/dashboard/unirse/x` o `/unirse-ahora/x` no son el enlace.
 */
const RUTAS_CON_TOKEN = /^\/(restablecer-contrasena|unirse)\/[^/]+/

/**
 * La URL que se le manda a Vercel Analytics, con el token reemplazado por
 * `[token]`. El token está vivo mientras no se use: no debe quedar en un
 * servicio de terceros. `null` si la URL no se puede leer.
 */
export function redactarUrlDeAnalitica(url: string): string | null {
  let leida: URL
  try {
    leida = new URL(url)
  } catch {
    return null
  }
  leida.pathname = leida.pathname.replace(RUTAS_CON_TOKEN, "/$1/[token]")
  // `URL` escapa los corchetes del pathname; en el panel de Analytics se leen mejor sin escapar.
  return leida.toString().replace("/%5Btoken%5D", "/[token]")
}

/** El `beforeSend` de `<Analytics />`: una URL que no se puede redactar no se envía. */
export function antesDeEnviarAnalitica(evento: BeforeSendEvent): BeforeSendEvent | null {
  const url = redactarUrlDeAnalitica(evento.url)
  return url === null ? null : { ...evento, url }
}
