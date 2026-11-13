/**
 * El odontograma de la ficha clínica, en notación FDI: cada pieza es un
 * número de dos dígitos, el cuadrante y la posición desde la línea media.
 *
 * - Permanente: cuadrantes 1 (superior derecho), 2 (superior izquierdo),
 *   3 (inferior izquierdo) y 4 (inferior derecho), posiciones 1 a 8.
 * - Temporal: cuadrantes 5 a 8, en el mismo orden, posiciones 1 a 5.
 * - "Derecho" e "izquierdo" son los del paciente.
 *
 * Cada pieza tiene cinco caras: vestibular (V), palatina (P, en el maxilar)
 * o lingual (L, en la mandíbula), mesial (M), distal (D) y oclusal (O, en
 * premolares y molares) o incisal (I, en incisivos y caninos).
 *
 * Una marca es de una cara (caries, obturación, sellante) o de la pieza entera
 * (corona, endodoncia, ausente, extracción indicada). `errorDeMarca` aplica
 * las mismas reglas que los CHECKs de `odontograma_marcas` (migración
 * `20261106120000_etapa_6_odontologia`): si cambia una, cambia la otra.
 *
 * Funciones puras, sin base ni sesión: las usan los endpoints y la pantalla.
 * Quién ve y escribe el odontograma no vive acá sino en `lib/permisos.ts`.
 */

export type Denticion = "permanente" | "temporal"

/** Las caras, en el orden en que se nombran ("caries oclusal y mesial"). */
export const CARAS = ["O", "I", "M", "D", "V", "P", "L"] as const
export type Cara = (typeof CARAS)[number]

export const TIPOS_DE_CARA = ["caries", "obturacion", "sellante"] as const
export type TipoDeCara = (typeof TIPOS_DE_CARA)[number]

/** En el orden en que se nombran en los hallazgos. */
export const TIPOS_DE_PIEZA = ["corona", "endodoncia", "extraccion", "ausente"] as const
export type TipoDePieza = (typeof TIPOS_DE_PIEZA)[number]

export const TIPOS_DE_MARCA = [...TIPOS_DE_CARA, ...TIPOS_DE_PIEZA] as const
export type TipoDeMarca = TipoDeCara | TipoDePieza

/** Una marca como viene de la base (`MarcaDental`): `cara` null es una marca de la pieza entera. */
export interface MarcaDelOdontograma {
  pieza: number
  cara: string | null
  tipo: string
}

const NOMBRES_DE_CARA: readonly { id: Cara; nombre: string }[] = [
  { id: "V", nombre: "vestibular" },
  { id: "P", nombre: "palatina" },
  { id: "L", nombre: "lingual" },
  { id: "M", nombre: "mesial" },
  { id: "D", nombre: "distal" },
  { id: "O", nombre: "oclusal" },
  { id: "I", nombre: "incisal" },
]

const NOMBRES_DE_TIPO: readonly { id: TipoDeMarca; nombre: string }[] = [
  { id: "caries", nombre: "Caries" },
  { id: "obturacion", nombre: "Obturación" },
  { id: "sellante", nombre: "Sellante" },
  { id: "corona", nombre: "Corona" },
  { id: "endodoncia", nombre: "Endodoncia" },
  { id: "ausente", nombre: "Ausente" },
  { id: "extraccion", nombre: "Extracción indicada" },
]

/** Por posición (1 a 8). Las temporales llevan "temporal" detrás. */
const PERMANENTES = ["incisivo central", "incisivo lateral", "canino", "primer premolar", "segundo premolar", "primer molar", "segundo molar", "tercer molar"]
const TEMPORALES = ["incisivo central", "incisivo lateral", "canino", "primer molar", "segundo molar"]

/** Por cuadrante (1 a 8). */
const LADOS = ["superior derecho", "superior izquierdo", "inferior izquierdo", "inferior derecho"]

// ─── Piezas ──────────────────────────────────────────────────────────────────

/** El cuadrante de una pieza: el primer dígito. */
export const cuadranteDe = (pieza: number): number => Math.floor(pieza / 10)

/** La posición desde la línea media: el segundo dígito. */
export const posicionDe = (pieza: number): number => pieza % 10

/** Cuántas piezas tiene un cuadrante: 8 en los permanentes, 5 en los temporales, 0 si no existe. */
function piezasPorCuadrante(cuadrante: number): number {
  if (cuadrante >= 1 && cuadrante <= 4) return 8
  if (cuadrante >= 5 && cuadrante <= 8) return 5
  return 0
}

/** Si es una pieza FDI: 11-18, 21-28, 31-38, 41-48, 51-55, 61-65, 71-75 u 81-85. */
export function esPiezaValida(pieza: unknown): pieza is number {
  if (typeof pieza !== "number" || !Number.isInteger(pieza)) return false
  const posicion = posicionDe(pieza)
  return posicion >= 1 && posicion <= piezasPorCuadrante(cuadranteDe(pieza))
}

/** Los cuadrantes de una dentición, en el orden de la arcada (1, 2, 3, 4). */
export function cuadrantesDe(denticion: Denticion): number[] {
  return denticion === "temporal" ? [5, 6, 7, 8] : [1, 2, 3, 4]
}

/** Las piezas de un cuadrante, desde la línea media hacia atrás. Vacío si el cuadrante no existe. */
export function piezasDelCuadrante(cuadrante: number): number[] {
  return Array.from({ length: piezasPorCuadrante(cuadrante) }, (_, i) => cuadrante * 10 + i + 1)
}

/** Las piezas de una dentición: 32 permanentes o 20 temporales, cuadrante por cuadrante. */
export function piezasDe(denticion: Denticion): number[] {
  return cuadrantesDe(denticion).flatMap(piezasDelCuadrante)
}

/** Permanente o temporal. Sólo para una pieza válida. */
export const denticionDe = (pieza: number): Denticion => (cuadranteDe(pieza) >= 5 ? "temporal" : "permanente")

/** Si la pieza es del maxilar (arriba): cuadrantes 1, 2, 5 y 6. */
export function esDelMaxilar(pieza: number): boolean {
  return [1, 2, 5, 6].includes(cuadranteDe(pieza))
}

/** Lo que se muestra si llega una pieza que no existe. */
const PIEZA_DESCONOCIDA = "Pieza desconocida"

/**
 * El nombre completo: "Primer molar superior derecho", "Canino temporal
 * inferior izquierdo". Nunca rompe con una pieza que no existe.
 */
export function nombreDePieza(pieza: number): string {
  if (!esPiezaValida(pieza)) return PIEZA_DESCONOCIDA
  const temporal = denticionDe(pieza) === "temporal"
  const tipo = (temporal ? TEMPORALES : PERMANENTES)[posicionDe(pieza) - 1]
  const lado = LADOS[(cuadranteDe(pieza) - 1) % 4]
  const nombre = `${tipo}${temporal ? " temporal" : ""} ${lado}`
  return nombre.charAt(0).toUpperCase() + nombre.slice(1)
}

// ─── Caras ───────────────────────────────────────────────────────────────────

export function esCara(cara: unknown): cara is Cara {
  return typeof cara === "string" && (CARAS as readonly string[]).includes(cara)
}

/**
 * Las cinco caras de una pieza, en el orden de `CARAS`: palatina o lingual
 * según la arcada, oclusal o incisal según la posición. Vacío si la pieza no
 * existe.
 */
export function carasDe(pieza: number): Cara[] {
  if (!esPiezaValida(pieza)) return []
  const interna: Cara = esDelMaxilar(pieza) ? "P" : "L"
  const central: Cara = posicionDe(pieza) <= 3 ? "I" : "O"
  return CARAS.filter((cara) => cara === interna || cara === central || cara === "V" || cara === "M" || cara === "D")
}

/** "oclusal", "palatina"… Busca en una lista y no en un objeto, como `nombreDeRubro`. */
export function nombreDeCara(cara: string): string {
  return NOMBRES_DE_CARA.find((c) => c.id === cara)?.nombre ?? "cara desconocida"
}

/** Las caras conocidas, sin repetir y en el orden de `CARAS`. Lo demás se descarta. */
export function ordenarCaras(caras: readonly unknown[]): Cara[] {
  return CARAS.filter((cara) => caras.includes(cara))
}

/** "a", "a y b", "a, b y c". */
function enumerar(partes: readonly string[]): string {
  if (partes.length <= 1) return partes.join("")
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`
}

/** "oclusal y mesial", en el orden de `CARAS`. Vacío si no hay ninguna. */
export function textoDeCaras(caras: readonly unknown[]): string {
  return enumerar(ordenarCaras(caras).map(nombreDeCara))
}

/** "OM": las letras, en el orden de `CARAS`. */
export function abreviaturaDeCaras(caras: readonly unknown[]): string {
  return ordenarCaras(caras).join("")
}

/**
 * Las caras de una prestación del plan: sin pieza ("Boca"), ninguna; con
 * pieza, caras de esa pieza sin repetir. Es la parte que la base no puede
 * revisar (que no se repitan); el resto lo repiten los CHECKs de
 * `prestaciones_del_plan`.
 */
export function sonCarasValidas(pieza: number | null, caras: readonly unknown[]): boolean {
  if (pieza === null) return caras.length === 0
  if (!esPiezaValida(pieza) || new Set(caras).size !== caras.length) return false
  const validas: readonly unknown[] = carasDe(pieza)
  return caras.every((cara) => validas.includes(cara))
}

// ─── Marcas ──────────────────────────────────────────────────────────────────

export function esTipoDeCara(tipo: unknown): tipo is TipoDeCara {
  return typeof tipo === "string" && (TIPOS_DE_CARA as readonly string[]).includes(tipo)
}

export function esTipoDePieza(tipo: unknown): tipo is TipoDePieza {
  return typeof tipo === "string" && (TIPOS_DE_PIEZA as readonly string[]).includes(tipo)
}

export function esTipoDeMarca(tipo: unknown): tipo is TipoDeMarca {
  return esTipoDeCara(tipo) || esTipoDePieza(tipo)
}

/** "Caries", "Extracción indicada"… */
export function nombreDeTipo(tipo: string): string {
  return NOMBRES_DE_TIPO.find((t) => t.id === tipo)?.nombre ?? "Marca desconocida"
}

/**
 * Por qué una marca no se puede guardar, o `null` si se puede. Las mismas
 * reglas que los CHECKs de la base, con un mensaje para quien marca:
 *
 * - la pieza existe en la notación FDI;
 * - el tipo es uno de los siete;
 * - caries, obturación y sellante van en una cara; corona, endodoncia,
 *   ausente y extracción indicada, en la pieza entera (sin cara);
 * - la cara es una de las cinco de esa pieza (`carasDe`).
 */
export function errorDeMarca(marca: { pieza: unknown; cara: unknown; tipo: unknown }): string | null {
  const { pieza, cara, tipo } = marca
  if (!esPiezaValida(pieza)) return "Esa pieza no existe en el odontograma."
  if (!esTipoDeMarca(tipo)) return "Esa marca no existe en el odontograma."
  if (esTipoDePieza(tipo)) {
    return cara === null || cara === undefined ? null : `${nombreDeTipo(tipo)} es de la pieza entera, sin cara.`
  }
  if (cara === null || cara === undefined) return `${nombreDeTipo(tipo)} va en una cara de la pieza.`
  if (!esCara(cara)) return "Esa cara no existe."
  if (!carasDe(pieza).includes(cara)) return `La pieza ${pieza} no tiene cara ${nombreDeCara(cara)}.`
  return null
}

/** Si la marca se puede guardar (`errorDeMarca` sin error). */
export function esMarcaValida(marca: { pieza: unknown; cara: unknown; tipo: unknown }): marca is MarcaDelOdontograma {
  return errorDeMarca(marca) === null
}

// ─── Resumen y hallazgos ─────────────────────────────────────────────────────

export interface ResumenDelOdontograma {
  carasConCaries: number
  carasObturadas: number
  piezasAusentes: number
  /** Piezas con extracción indicada. */
  porExtraer: number
}

/**
 * Los cuatro números del resumen. Con `denticion`, sólo los de esa dentición
 * (la que se está mirando); sin ella, todos. Las marcas inválidas no cuentan.
 */
export function resumenDelOdontograma(marcas: readonly MarcaDelOdontograma[], denticion?: Denticion): ResumenDelOdontograma {
  const contadas = marcas.filter((marca) => esMarcaValida(marca) && (!denticion || denticionDe(marca.pieza) === denticion))
  const cuantas = (tipo: TipoDeMarca) => contadas.filter((marca) => marca.tipo === tipo).length
  return {
    carasConCaries: cuantas("caries"),
    carasObturadas: cuantas("obturacion"),
    piezasAusentes: cuantas("ausente"),
    porExtraer: cuantas("extraccion"),
  }
}

/**
 * Los hallazgos de una pieza en una línea: "Caries oclusal y mesial ·
 * Obturación distal · Corona". Primero las marcas de cara (caries, obturación,
 * sellante, cada una con sus caras en el orden de `CARAS`), después las de la
 * pieza (corona, endodoncia, extracción indicada, ausente). Vacío si no tiene
 * ninguna: la pantalla decide cómo decir "sana".
 */
export function textoDeHallazgos(pieza: number, marcas: readonly MarcaDelOdontograma[]): string {
  const deLaPieza = marcas.filter((marca) => marca.pieza === pieza && esMarcaValida(marca))
  const partes: string[] = []
  for (const tipo of TIPOS_DE_CARA) {
    const caras = deLaPieza.filter((marca) => marca.tipo === tipo).map((marca) => marca.cara)
    if (caras.length > 0) partes.push(`${nombreDeTipo(tipo)} ${textoDeCaras(caras)}`)
  }
  for (const tipo of TIPOS_DE_PIEZA) {
    if (deLaPieza.some((marca) => marca.tipo === tipo)) partes.push(nombreDeTipo(tipo))
  }
  return partes.join(" · ")
}

/** Las piezas con algún hallazgo, de menor a mayor número, con su texto. */
export function hallazgosPorPieza(marcas: readonly MarcaDelOdontograma[]): { pieza: number; texto: string }[] {
  const piezas = [...new Set(marcas.filter(esMarcaValida).map((marca) => marca.pieza))].sort((a, b) => a - b)
  return piezas.map((pieza) => ({ pieza, texto: textoDeHallazgos(pieza, marcas) }))
}
