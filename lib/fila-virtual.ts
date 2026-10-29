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
