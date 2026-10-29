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

/** Cómo se anula la atención de quien sale de la fila desde su celular. */
export const MOTIVO_SALIO_DE_LA_FILA = "Salió de la fila desde su celular"

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
 * Si el aviso "ya casi es tu turno" le toca a esta persona: con correo, sin
 * aviso previo y con 1 persona adelante o menos. Menos de 1 también: si dos
 * de adelante salen a la vez, quien tenía 2 pasa directo a 0 y también tiene
 * que enterarse.
 */
export function leTocaElAviso(adelante: number, filaEmail: string | null, filaAvisadaAt: Date | null): boolean {
  return filaEmail !== null && filaEmail !== "" && filaAvisadaAt === null && adelante <= 1
}
