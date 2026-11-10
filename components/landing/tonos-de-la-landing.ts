/**
 * Los cuatro tintes con que la landing distingue pasos, tarjetas y piezas, en
 * el orden en que se reparten: ciruela, frambuesa, pistacho y añil. Los
 * nombres son históricos (`app/globals.css`): hoy son burdeos, rojo, arena y
 * tierra. Las clases van escritas enteras para que Tailwind las vea.
 *
 * - `suave`: el fondo de la tarjeta, del cuadro de un ícono o de un paso.
 * - `texto`: texto e íconos sobre crema, blanco o su suave (todos pasan 4,5:1).
 * - `relleno`: el mismo color de `texto` como fondo, con texto blanco encima
 *   (el número del paso activo, una barra de progreso, un contador).
 * - `anillo`: el halo del número del paso activo (`ring-*`).
 * - `barra`: el color fuerte de una barra de gráfico sobre blanco. Decorativo.
 *
 * Sobre cualquier `suave` el gris `texto-2` de la landing (#6E5E58) pasa 4,5:1
 * por poco (4,6 a 5,2): si el texto es chico y delgado, `text-navy/75` es más
 * seguro.
 */
export type TonoDeLanding = "ciruela" | "frambuesa" | "pistacho" | "anil"

export const TONOS: readonly TonoDeLanding[] = ["ciruela", "frambuesa", "pistacho", "anil"]

interface ClasesDeTono {
  suave: string
  texto: string
  relleno: string
  anillo: string
  barra: string
}

export const CLASES_DE_TONO: Record<TonoDeLanding, ClasesDeTono> = {
  ciruela: {
    suave: "bg-ciruela-suave",
    texto: "text-ciruela",
    relleno: "bg-ciruela",
    anillo: "ring-ciruela-suave",
    barra: "bg-ciruela",
  },
  frambuesa: {
    suave: "bg-frambuesa-suave",
    texto: "text-frambuesa-texto",
    relleno: "bg-frambuesa-texto",
    anillo: "ring-frambuesa-suave",
    barra: "bg-frambuesa",
  },
  pistacho: {
    suave: "bg-pistacho-suave",
    texto: "text-pistacho-texto",
    relleno: "bg-pistacho-texto",
    anillo: "ring-pistacho-suave",
    barra: "bg-pistacho-oscuro",
  },
  anil: {
    suave: "bg-anil-suave",
    texto: "text-anil",
    relleno: "bg-anil",
    anillo: "ring-anil-suave",
    barra: "bg-anil",
  },
}

/** El tinte del lugar `indice` de una lista, dando la vuelta a los cuatro. */
export function tonoEn(indice: number): TonoDeLanding {
  return TONOS[indice % TONOS.length]
}
