import {
  carasDe,
  denticionDe,
  esTipoDeCara,
  esTipoDePieza,
  nombreDePieza,
  posicionDe,
  textoDeHallazgos,
  type Cara,
  type Denticion,
  type MarcaDelOdontograma,
  type TipoDeCara,
  type TipoDeMarca,
  type TipoDePieza,
} from "@/lib/odontograma"

/**
 * Lo que hace cada toque en el odontograma, como funciones puras sobre la
 * lista de marcas (la misma forma que guarda la API: `{ pieza, cara, tipo }`,
 * `cara` null en las de la pieza entera). Las reglas son las del diseño de la
 * ficha:
 *
 * - Con una herramienta de cara (caries, obturación, sellante), tocar una
 *   cara la marca; tocarla de nuevo con la misma, la desmarca; con otra, la
 *   cambia. Una cara lleva una sola marca.
 * - Con una de pieza (corona, endodoncia, ausente, extracción indicada),
 *   tocar la pieza (una cara o su número) pone o saca esa marca.
 * - "Borrar" en una cara saca la marca de esa cara; en el número, todo lo de
 *   la pieza.
 *
 * Qué es una marca válida (pieza, cara y tipo) lo dice `lib/odontograma.ts`;
 * acá no se repite: sólo se ofrecen caras de `carasDe`.
 */

export type Herramienta = TipoDeMarca | "borrar"

/** Las herramientas en el orden de la barra, con su nombre en pantalla. */
export const HERRAMIENTAS: readonly { id: Herramienta; nombre: string }[] = [
  { id: "caries", nombre: "Caries" },
  { id: "obturacion", nombre: "Obturación" },
  { id: "sellante", nombre: "Sellante" },
  { id: "corona", nombre: "Corona" },
  { id: "endodoncia", nombre: "Endodoncia" },
  { id: "ausente", nombre: "Ausente" },
  { id: "extraccion", nombre: "Extracción indicada" },
  { id: "borrar", nombre: "Borrar" },
]

export function nombreDeHerramienta(herramienta: Herramienta): string {
  return HERRAMIENTAS.find((h) => h.id === herramienta)?.nombre ?? ""
}

/** Qué hay marcado en una cara, o `null` si está sana. */
export function marcaDeCara(marcas: readonly MarcaDelOdontograma[], pieza: number, cara: Cara): TipoDeCara | null {
  const tipo = marcas.find((marca) => marca.pieza === pieza && marca.cara === cara)?.tipo
  return esTipoDeCara(tipo) ? tipo : null
}

/** Si la pieza tiene esa marca de pieza entera. */
export function tieneMarcaDePieza(marcas: readonly MarcaDelOdontograma[], pieza: number, tipo: TipoDePieza): boolean {
  return marcas.some((marca) => marca.pieza === pieza && marca.cara === null && marca.tipo === tipo)
}

/** Pone o saca una marca de pieza entera. */
function alternarMarcaDePieza(marcas: readonly MarcaDelOdontograma[], pieza: number, tipo: TipoDePieza): MarcaDelOdontograma[] {
  if (tieneMarcaDePieza(marcas, pieza, tipo)) {
    return marcas.filter((marca) => !(marca.pieza === pieza && marca.cara === null && marca.tipo === tipo))
  }
  return [...marcas, { pieza, cara: null, tipo }]
}

/** Las marcas sin la de esa cara. */
function sinLaCara(marcas: readonly MarcaDelOdontograma[], pieza: number, cara: Cara): MarcaDelOdontograma[] {
  return marcas.filter((marca) => !(marca.pieza === pieza && marca.cara === cara))
}

/**
 * Tocar una cara de una pieza con una herramienta. Una cara que la pieza no
 * tiene (palatina en la mandíbula, oclusal en un incisivo) no cambia nada.
 */
export function tocarCara(
  marcas: readonly MarcaDelOdontograma[],
  pieza: number,
  cara: Cara,
  herramienta: Herramienta
): MarcaDelOdontograma[] {
  if (!carasDe(pieza).includes(cara)) return [...marcas]
  if (herramienta === "borrar") return sinLaCara(marcas, pieza, cara)
  if (esTipoDePieza(herramienta)) return alternarMarcaDePieza(marcas, pieza, herramienta)
  if (marcaDeCara(marcas, pieza, cara) === herramienta) return sinLaCara(marcas, pieza, cara)
  return [...sinLaCara(marcas, pieza, cara), { pieza, cara, tipo: herramienta }]
}

/**
 * Tocar la pieza entera (su número, o Enter con el teclado). Con una
 * herramienta de cara no cambia nada: sólo la elige quien llama.
 */
export function tocarPieza(marcas: readonly MarcaDelOdontograma[], pieza: number, herramienta: Herramienta): MarcaDelOdontograma[] {
  if (herramienta === "borrar") return marcas.filter((marca) => marca.pieza !== pieza)
  if (esTipoDePieza(herramienta)) return alternarMarcaDePieza(marcas, pieza, herramienta)
  return [...marcas]
}

const clave = (marca: MarcaDelOdontograma) => `${marca.pieza}:${marca.cara ?? ""}:${marca.tipo}`

/** Si dos listas tienen las mismas marcas, en cualquier orden: para saber si hay cambios sin guardar. */
export function mismasMarcas(a: readonly MarcaDelOdontograma[], b: readonly MarcaDelOdontograma[]): boolean {
  const deA = new Set(a.map(clave))
  const deB = new Set(b.map(clave))
  return deA.size === deB.size && [...deA].every((marca) => deB.has(marca))
}

/** "caries oclusal y mesial, corona", o "sin hallazgos": para leer en voz alta. */
export function hallazgosParaLeer(pieza: number, marcas: readonly MarcaDelOdontograma[]): string {
  const texto = textoDeHallazgos(pieza, marcas)
  return texto ? texto.split(" · ").join(", ").toLocaleLowerCase("es-CL") : "sin hallazgos"
}

/**
 * El nombre accesible de una pieza en la arcada: "Pieza 16, primer molar
 * superior derecho: caries oclusal y mesial".
 */
export function nombreAccesibleDePieza(pieza: number, marcas: readonly MarcaDelOdontograma[]): string {
  return `Pieza ${pieza}, ${nombreDePieza(pieza).toLocaleLowerCase("es-CL")}: ${hallazgosParaLeer(pieza, marcas)}`
}

/** Los terceros molares (18, 28, 38, 48) llevan el número entre paréntesis, como en la ficha de papel. */
export function etiquetaDePieza(pieza: number): string {
  return pieza < 50 && posicionDe(pieza) === 8 ? `(${pieza})` : String(pieza)
}

/** Con qué dentición abre: la temporal sólo si todo lo marcado es temporal. */
export function denticionInicial(marcas: readonly MarcaDelOdontograma[]): Denticion {
  return marcas.length > 0 && marcas.every((marca) => denticionDe(marca.pieza) === "temporal") ? "temporal" : "permanente"
}

/**
 * La dentición que se muestra: la que eligió quien mira o, mientras no tocó
 * nada (`elegida` en `null`), la que piden las marcas. Así, si las marcas
 * llegan después de montar (la ficha las carga), un odontograma todo temporal
 * se abre en la temporal y no en la permanente vacía. Apenas quien mira hace
 * algo, queda fija: borrar la última marca temporal no le cambia la vista.
 */
export function denticionAMostrar(marcas: readonly MarcaDelOdontograma[], elegida: Denticion | null): Denticion {
  return elegida ?? denticionInicial(marcas)
}
