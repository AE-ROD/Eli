import type { TipoDeCara } from "@/lib/odontograma"

/**
 * Los colores del odontograma. Son del dibujo clínico y no del sistema de
 * diseño: no son pasteles de módulo ni van en `app/globals.css`, porque sólo
 * los usa esta pantalla y cada uno tiene un significado clínico de siempre
 * (rojo lo que hay que tratar, azul lo ya tratado). Por eso viven acá, con su
 * contraste anotado, y se aplican con `style` en el SVG.
 *
 * Todos pasan 3:1 contra el blanco de la pieza y contra crema (WCAG 1.4.11,
 * objetos gráficos). Nunca son la única pista: cada marca se nombra en el
 * nombre accesible de la pieza, en "Pieza seleccionada" y en los hallazgos,
 * y la leyenda las dice en palabras. El sellante lleva además rayas: contra
 * la caries no se distingue sólo por el tono para quien no ve el rojo.
 */
export const COLOR_DE_CARA: Record<TipoDeCara, string> = {
  /** Rojo: 4,4:1 sobre blanco. */
  caries: "#d64545",
  /** Azul: 8,1:1. */
  obturacion: "#2b4c9b",
  /** Verde azulado: 4,4:1 (el del diseño, #2f9e8f, daba 3,0 sobre superficie). */
  sellante: "#23877a",
}

/** Ámbar del contorno de la corona: 4,3:1 (el del diseño, #c27612, daba 3,2 sobre superficie). */
export const COLOR_DE_CORONA = "#b06a10"

/** Morado del triángulo de la endodoncia: 5,9:1. */
export const COLOR_DE_ENDODONCIA = "#6d4fc2"

/** Gris de la X de una pieza ausente: 4,6:1. */
export const COLOR_DE_AUSENTE = "#6b7780"

/** Rojo de la X de una extracción indicada: el de la caries, también algo por tratar. */
export const COLOR_DE_EXTRACCION = COLOR_DE_CARA.caries

/** El contorno de cada pieza (el texto secundario, 5,3:1). */
export const COLOR_DEL_CONTORNO = "#5f6d77"
/**
 * Las líneas que separan las caras: más claras que el contorno, pero sobre 3:1
 * contra todos los fondos de cara: 3,4:1 sobre blanco, 3,3 sobre crema, 3,1
 * sobre el del tercer molar y sobre el de la pieza ausente. La de antes
 * (#8d99a2) daba 2,9:1 sobre blanco y no se distinguía la cara a tocar.
 */
export const COLOR_DE_LAS_DIVISIONES = "#808c95"

/** El fondo de una cara sana; el de una pieza ausente, y el de un tercer molar, que a menudo no está. */
export const FONDO_DE_CARA = "#ffffff"
export const FONDO_DE_AUSENTE = "#f5f3ee"
export const FONDO_DE_TERCER_MOLAR = "#eef3f6"

/** El paladar y la lengua, de fondo: sólo orientan. Su texto (#8a3b3b) da 6,5:1 sobre su fondo. */
export const FONDO_DE_PALADAR = "#f7e3e3"
export const TEXTO_DE_PALADAR = "#8a3b3b"

/** Las rayas del sellante, en CSS: para las muestras de la barra y de la leyenda. */
export const RAYAS_DE_SELLANTE = `repeating-linear-gradient(135deg, ${COLOR_DE_CARA.sellante} 0 3px, #ffffff 3px 4.5px)`
