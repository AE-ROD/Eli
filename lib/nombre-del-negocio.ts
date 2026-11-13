/**
 * El nombre de un negocio (`Business.name`): las reglas que comparten el
 * registro, el endpoint que lo edita (`PUT /api/configuracion/nombre`) y la
 * pantalla que lo pide, para que las tres digan lo mismo.
 *
 * Puro y sin dependencias: se puede importar desde el navegador sin arrastrar
 * zod ni nada del servidor. El esquema de zod (`nombreDelNegocioSchema`, en
 * `lib/validaciones.ts`) se arma con estos mismos números y mensajes.
 */

export const LARGO_MINIMO_DEL_NOMBRE_DEL_NEGOCIO = 2
export const LARGO_MAXIMO_DEL_NOMBRE_DEL_NEGOCIO = 80

export const MENSAJES_DEL_NOMBRE_DEL_NEGOCIO = {
  falta: "Falta el nombre del negocio",
  noEsTexto: "El nombre del negocio no es válido",
  muyCorto: `El nombre del negocio tiene que tener al menos ${LARGO_MINIMO_DEL_NOMBRE_DEL_NEGOCIO} caracteres`,
  muyLargo: `El nombre del negocio puede tener hasta ${LARGO_MAXIMO_DEL_NOMBRE_DEL_NEGOCIO} caracteres`,
} as const

export type NombreDelNegocioLeido = { ok: true; nombre: string } | { ok: false; error: string }

/**
 * El nombre tal como se guarda: sin los espacios de las puntas, de 2 a 80
 * caracteres. Lo que no cumple vuelve con el mensaje que ve quien lo escribió.
 */
export function leerNombreDelNegocio(texto: unknown): NombreDelNegocioLeido {
  if (texto === undefined || texto === null) return { ok: false, error: MENSAJES_DEL_NOMBRE_DEL_NEGOCIO.falta }
  if (typeof texto !== "string") return { ok: false, error: MENSAJES_DEL_NOMBRE_DEL_NEGOCIO.noEsTexto }
  const nombre = texto.trim()
  if (nombre.length < LARGO_MINIMO_DEL_NOMBRE_DEL_NEGOCIO) return { ok: false, error: MENSAJES_DEL_NOMBRE_DEL_NEGOCIO.muyCorto }
  if (nombre.length > LARGO_MAXIMO_DEL_NOMBRE_DEL_NEGOCIO) return { ok: false, error: MENSAJES_DEL_NOMBRE_DEL_NEGOCIO.muyLargo }
  return { ok: true, nombre }
}

/**
 * Si hay algo que guardar: el nombre escrito (ya recortado) es válido y no es
 * el que está guardado. Un cambio sólo de espacios no es un cambio.
 */
export function nombreCambio(escrito: string, guardado: string): boolean {
  const leido = leerNombreDelNegocio(escrito)
  return leido.ok && leido.nombre !== guardado.trim()
}
