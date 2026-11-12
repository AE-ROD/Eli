/**
 * Qué servicios hace cada integrante del equipo, tal como lo ve quien visita
 * la página pública del negocio. Lógica pura, sin pantalla ni base: la usan
 * la lectura de la página (`app/reservar/[slug]/_pagina/datos-de-la-pagina.ts`),
 * el bloque Equipo de la mini página y el selector del primer paso de la
 * reserva.
 *
 * La regla de fondo es la de `MemberService` (`lib/agenda-publica.ts`): un
 * profesional sin filas hace todos los servicios; con filas, sólo esos. Acá se
 * llama `null` a "hace todos".
 */

/** Lo que dice la tarjeta de quien hace todos los servicios. */
export const TEXTO_HACE_TODOS = "Hace todos los servicios"

/**
 * Lo que dice la tarjeta de quien no tiene nada que se pueda reservar: con sus
 * servicios acotados, ya no hace ninguno de los que hoy hay (por ejemplo, los
 * desactivaron); o el negocio no tiene ningún servicio activo, y entonces
 * tampoco quien "hace todos" tiene qué prometer.
 */
export const TEXTO_SIN_SERVICIOS = "Sin servicios para reservar por ahora"

/** Cuántos nombres de servicio caben en la tarjeta antes del "+N más". */
export const TOPE_DE_NOMBRES_EN_LA_TARJETA = 3

/**
 * Lo que se publica de los servicios de un profesional: `null` si hace todos
 * (no tiene filas), o sus ids, **sólo de los servicios activos del negocio**
 * (`activos`) y en el orden del catálogo.
 *
 * Una fila que apunta a un servicio inactivo, o a uno que no es de este
 * negocio, no aparece: `activos` es lo único que puede salir. Quien tiene
 * filas pero ninguna es de un servicio activo queda con la lista vacía (no
 * hace ninguno que se pueda reservar), no con `null`: mirar sólo lo activo no
 * lo convierte en alguien que hace todo.
 */
export function servicioIdsPublicos(filas: readonly string[], activos: readonly string[]): string[] | null {
  if (filas.length === 0) return null
  const lasQueHace = new Set(filas)
  return activos.filter((servicioId) => lasQueHace.has(servicioId))
}

/**
 * Si hace al menos uno de esos servicios. `null` (hace todos) cuenta, pero sólo
 * si hay algún servicio: "hace todos" de un catálogo vacío no es nada que se
 * pueda reservar (el negocio sin servicios activos no ofrece reservas).
 */
export function haceAlgunServicio(servicioIds: readonly string[] | null, servicios: readonly { id: string }[]): boolean {
  if (servicioIds === null) return servicios.length > 0
  return servicios.some((servicio) => servicioIds.includes(servicio.id))
}

/**
 * La línea de la tarjeta del equipo: "Hace todos los servicios", o "Hace:
 * Corte, Barba, Tinte, +2 más" (hasta `tope` nombres, en el orden del
 * catálogo). Si sobra uno solo se escribe su nombre en vez de "+1 más": ocupa
 * lo mismo y dice más. Quien hace todos los que hay, aunque los tenga
 * marcados uno por uno, también "hace todos". Sin ningún servicio que reservar
 * (ni siquiera quien "hace todos" promete algo), "Sin servicios para reservar
 * por ahora": la misma línea de quien tiene servicios pero ninguno activo.
 */
export function textoDeLoQueHace(
  servicioIds: readonly string[] | null,
  servicios: readonly { id: string; name: string }[],
  tope: number = TOPE_DE_NOMBRES_EN_LA_TARJETA
): string {
  if (servicios.length === 0) return TEXTO_SIN_SERVICIOS
  if (servicioIds === null) return TEXTO_HACE_TODOS
  const hechos = servicios.filter((servicio) => servicioIds.includes(servicio.id))
  if (hechos.length === 0) return TEXTO_SIN_SERVICIOS
  if (hechos.length === servicios.length) return TEXTO_HACE_TODOS
  const visibles = hechos.length === tope + 1 ? hechos : hechos.slice(0, tope)
  const resto = hechos.length - visibles.length
  return `Hace: ${visibles.map((servicio) => servicio.name).join(", ")}${resto > 0 ? `, +${resto} más` : ""}`
}
