/**
 * Qué hace el encabezado de la landing según cómo se mueve la página:
 *
 * - `arriba`: la página está arriba de todo y el encabezado ocupa su lugar.
 * - `oculto`: la página baja; el encabezado se va para dejar leer.
 * - `flotante`: la página sube; vuelve como tarjeta fija, a mano.
 *
 * Es una función pura para poder probarla sin navegador: el hook
 * `components/movimiento/usar-direccion-de-scroll.ts` le pasa la posición en
 * cada cuadro y guarda lo que devuelve.
 */

export type EstadoDelEncabezado = "arriba" | "oculto" | "flotante"

/** Lo que hay que recordar entre una lectura de la posición y la siguiente. */
export interface LecturaDeScroll {
  estado: EstadoDelEncabezado
  /** Dónde se decidió `estado`. El próximo movimiento se mide desde acá. */
  y: number
}

/**
 * Píxeles por debajo de los cuales un movimiento no cuenta, y alto hasta el
 * que la página se considera arriba de todo. Sin umbral, el temblor del dedo
 * en un teléfono o el rebote al final del scroll harían parpadear el
 * encabezado.
 */
export const UMBRAL_DE_SCROLL = 10

/** Antes de la primera lectura se supone la página arriba de todo. */
export const LECTURA_INICIAL: LecturaDeScroll = { estado: "arriba", y: 0 }

/**
 * El estado que sigue a `anterior` cuando la página llega a `y`.
 *
 * Un movimiento menor que el umbral devuelve `anterior` tal cual, sin mover el
 * punto desde el que se mide: así se acumula un scroll lento de pocos píxeles
 * por cuadro, que si no nunca llegaría a contar. Arriba de todo no hay umbral
 * que valga, y una posición negativa (el rebote de iOS) también es arriba.
 */
export function leerScroll(anterior: LecturaDeScroll, y: number): LecturaDeScroll {
  if (y <= UMBRAL_DE_SCROLL) {
    return anterior.estado === "arriba" && anterior.y === y ? anterior : { estado: "arriba", y }
  }
  const recorrido = y - anterior.y
  if (Math.abs(recorrido) < UMBRAL_DE_SCROLL) return anterior
  return { estado: recorrido > 0 ? "oculto" : "flotante", y }
}
