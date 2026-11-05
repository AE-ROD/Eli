/**
 * Fila virtual (#85, etapa 4). Quien se anota desde `/fila/[slug]` es una
 * atención (`Visit`) "en-espera" con `origen` "fila": el Tablero la atiende
 * como a quien llega sin reserva. El nombre va en `customerName`; el resto,
 * en las columnas `fila*` (ver el esquema).
 */

/** Valores de `Visit.origen`. Los mismos que la CHECK de la migración. */
export const ORIGEN_TABLERO = "tablero"
export const ORIGEN_FILA = "fila"
export const ORIGENES_DE_ATENCION = [ORIGEN_TABLERO, ORIGEN_FILA] as const
export type OrigenDeAtencion = (typeof ORIGENES_DE_ATENCION)[number]

/** Rango de `Business.filaVirtualTope`. El mismo que la CHECK de la migración. */
export const TOPE_DE_FILA_MINIMO = 1
export const TOPE_DE_FILA_MAXIMO = 100

/**
 * El largo máximo del nombre con que alguien se anota. Más corto que el de un
 * cliente (100): es para llamarlo en el local y verlo en la pantalla, y lo
 * escribe un anónimo.
 */
export const LARGO_MAXIMO_NOMBRE_EN_FILA = 40

/** Cómo se anula la atención de quien sale de la fila desde su celular. */
export const MOTIVO_SALIO_DE_LA_FILA = "Salió de la fila desde su celular"

/** Cómo se anulan las atenciones en espera cuando el local vacía la fila del día. */
export const MOTIVO_FILA_VACIADA = "El local vació la fila del día"

/** Cada cuánto pregunta el celular por su posición, y la pantalla del local por la fila. */
export const POLLING_DEL_CELULAR_MS = 20_000
export const POLLING_DE_LA_PANTALLA_MS = 15_000

/**
 * Minutos por persona cuando el negocio no tiene servicios activos con
 * duración: lo que dura un corte de pelo, el caso típico de una fila.
 */
export const MINUTOS_POR_PERSONA_POR_DEFECTO = 20
/** Entre estos topes queda el promedio: un servicio de 8 horas no dice cuánto dura un turno. */
const MINUTOS_POR_PERSONA_MINIMO = 5
const MINUTOS_POR_PERSONA_MAXIMO = 120

/**
 * Cuánto dura, en promedio, atender a una persona: el promedio de la
 * duración de los servicios activos del negocio, entre 5 y 120 minutos. Sin
 * servicios con duración válida, 20.
 */
export function minutosPorPersona(duraciones: readonly number[]): number {
  const validas = duraciones.filter((minutos) => Number.isFinite(minutos) && minutos > 0)
  if (validas.length === 0) return MINUTOS_POR_PERSONA_POR_DEFECTO
  const promedio = validas.reduce((suma, minutos) => suma + minutos, 0) / validas.length
  return Math.min(MINUTOS_POR_PERSONA_MAXIMO, Math.max(MINUTOS_POR_PERSONA_MINIMO, Math.round(promedio)))
}

/**
 * El tiempo estimado de espera, en minutos: las personas que van antes por lo
 * que dura atender a una (`minutosPorPersona`), redondeado hacia arriba a
 * múltiplos de 5 para no prometer una precisión que no tiene. Es una cota
 * conservadora: no cuenta que varios profesionales atienden a la vez ni lo
 * que le falta a quien está en la silla. Con nadie adelante, 0 ("eres el
 * siguiente").
 */
export function minutosEstimados(adelante: number, porPersona: number): number {
  if (!(adelante > 0)) return 0
  return Math.ceil((adelante * porPersona) / 5) * 5
}

/**
 * El nombre como se ve en la pantalla del local: el primer nombre y la
 * inicial del segundo, "Juan P.". Nunca el nombre completo: la pantalla la
 * ve todo el que entra. Una sola palabra queda tal cual.
 */
export function nombreParaPantalla(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean)
  if (palabras.length === 0) return ""
  const [primera, segunda] = palabras
  if (!segunda) return primera
  return `${primera} ${segunda.charAt(0).toLocaleUpperCase("es-CL")}.`
}

/**
 * La primera palabra del nombre con que se anotó, para el correo "ya casi es
 * tu turno": como `nombreParaPantalla`, nunca el nombre completo (lo escribió
 * un anónimo y le llega a la casilla que dejó).
 */
export function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/).filter(Boolean)[0] ?? ""
}

/**
 * Si el aviso "ya casi es tu turno" le toca a esta persona: con correo, sin
 * aviso previo y con 1 persona adelante o menos. Menos de 1 también: si dos
 * de adelante salen a la vez, quien tenía 2 pasa directo a 0 y también tiene
 * que enterarse.
 */
export function leTocaElAviso(adelante: number, filaEmail: string | null, filaAvisadaAt: Date | null): boolean {
  return filaEmail !== null && filaEmail !== "" && filaAvisadaAt === null && adelante <= 1
}

// ─── El turno guardado en el navegador (#155) ────────────────────────────────

/** El token del celular: 32 bytes en base64url (`generarToken`). Lo demás no se busca ni se guarda. */
export const FORMA_DEL_TOKEN_DE_FILA = /^[A-Za-z0-9_-]{43}$/

/** Dónde se guarda el turno de un negocio en este navegador: uno por negocio. */
export function llaveDelTurnoGuardado(slug: string): string {
  return `eli:fila:${slug}`
}

/** El enlace al turno de ese token: `/fila/[slug]/[token]`. */
export function enlaceDelTurno(slug: string, token: string): string {
  return `/fila/${encodeURIComponent(slug)}/${token}`
}

/** El token de un enlace `/fila/[slug]/[token]`, o `null` si no lo es. */
export function tokenDelEnlace(enlace: string): string | null {
  const token = enlace.split("/").pop() ?? ""
  return FORMA_DEL_TOKEN_DE_FILA.test(token) ? token : null
}

/**
 * El token del turno que se sacó desde este navegador en ese negocio, o
 * `null`. Lo que no tenga forma de token se ignora. Nunca lanza: en una
 * ventana privada o con el almacenamiento bloqueado, `localStorage` no está
 * o lanza, y ahí simplemente no hay turno guardado.
 */
export function leerTurnoGuardado(slug: string): string | null {
  try {
    const valor = window.localStorage.getItem(llaveDelTurnoGuardado(slug))
    return valor && FORMA_DEL_TOKEN_DE_FILA.test(valor) ? valor : null
  } catch {
    return null
  }
}

/** Recuerda el turno recién sacado. Nunca lanza: si no se puede guardar, la fila funciona igual. */
export function guardarTurno(slug: string, token: string): void {
  try {
    window.localStorage.setItem(llaveDelTurnoGuardado(slug), token)
  } catch {
    // Sin almacenamiento: no se recuerda, nada más.
  }
}

/** Olvida el turno guardado (ya terminó, salió o no existe). Nunca lanza. */
export function olvidarTurno(slug: string): void {
  try {
    window.localStorage.removeItem(llaveDelTurnoGuardado(slug))
  } catch {
    // Sin almacenamiento: no hay nada que olvidar.
  }
}

/** Si un turno con este estado sigue vivo: todavía espera o lo están atendiendo. */
export function turnoSigueVivo(estado: string): boolean {
  return estado === "esperando" || estado === "atendiendo"
}
