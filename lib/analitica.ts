import type { BeforeSendEvent } from "@vercel/analytics/next"

/**
 * Las rutas que llevan un token, y cómo se escriben sin él. Sólo esas, y sólo
 * desde la raíz: `/dashboard/unirse/x` o `/unirse-ahora/x` no son el enlace.
 * Lo público que se deja es el slug del negocio. El orden importa: la baja de
 * un cliente (`/baja-de-correos/cliente/<token>`) va antes que la del dueño
 * (`/baja-de-correos/<token>`), que si no la tomaría como token "cliente" y
 * dejaría el de verdad a la vista.
 *
 * - Restablecer la contraseña y unirse a un equipo.
 * - Dejar de recibir correos: la del dueño (no vence y lleva el id del
 *   usuario) y la de un cliente.
 * - Cancelar o reagendar una cita sin cuenta: `/reservar/<slug>/cita/<token>`.
 * - Salir de la lista de espera: `/reservar/<slug>/espera/<token>`.
 * - Mirar el turno en la fila virtual: `/fila/<slug>/<token>`.
 */
const RUTAS_CON_TOKEN: readonly [RegExp, string][] = [
  [/^\/baja-de-correos\/cliente\/[^/]+/, "/baja-de-correos/cliente/[token]"],
  [/^\/(restablecer-contrasena|unirse|baja-de-correos)\/[^/]+/, "/$1/[token]"],
  [/^\/reservar\/([^/]+)\/(cita|espera)\/[^/]+/, "/reservar/$1/$2/[token]"],
  [/^\/fila\/([^/]+)\/[^/]+/, "/fila/$1/[token]"],
]

function decodificarSegmentos(pathname: string): string {
  return pathname
    .split("/")
    .map((segmento) => {
      try {
        return decodeURIComponent(segmento)
      } catch {
        return segmento
      }
    })
    .join("/")
}

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
  // Se compara con cada segmento decodificado: `/fil%61/<slug>/<token>` es la
  // misma página para el enrutador y no puede dejar el token a la vista. La
  // primera regla que calce y nada más: cada ruta tiene un solo token.
  const ruta = decodificarSegmentos(leida.pathname)
  const regla = RUTAS_CON_TOKEN.find(([patron]) => patron.test(ruta))
  if (regla) leida.pathname = ruta.replace(regla[0], regla[1])
  // `URL` escapa los corchetes del pathname; en el panel de Analytics se leen mejor sin escapar.
  return leida.toString().replace("/%5Btoken%5D", "/[token]")
}

/** El `beforeSend` de `<Analytics />`: una URL que no se puede redactar no se envía. */
export function antesDeEnviarAnalitica(evento: BeforeSendEvent): BeforeSendEvent | null {
  const url = redactarUrlDeAnalitica(evento.url)
  return url === null ? null : { ...evento, url }
}
