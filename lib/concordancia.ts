import type { Genero, Sustantivo } from "@/lib/vocabulario"

/**
 * Concordancia en español para las palabras de la interfaz
 * (`vocabularioDe(rubro).palabras`, en `lib/vocabulario.ts`).
 *
 * Por qué existe: una cadena suelta no sabe de género, y pegarle el artículo a
 * mano ("el", "un", "ningún") sólo sirve para el masculino. Con la palabra y su
 * género (`Sustantivo`) estas funciones escriben la frase completa, así que
 * `el(palabras.profesional)` es "la estilista" en un salón y "el odontólogo"
 * en una clínica sin que la pantalla lo sepa.
 *
 * Todo lo que devuelven va en minúscula, como va en medio de una frase; para
 * comenzar una frase o un título, `conMayuscula` (de `lib/vocabulario.ts`).
 * Son funciones puras: no leen el rubro ni la sesión, sólo reciben la palabra.
 *
 * Límite conocido: el artículo ante un sustantivo femenino que empieza con "a"
 * tónica ("el agua", "un hacha", "ningún águila") lleva la forma masculina. Hoy
 * ninguna palabra del vocabulario es así, así que no se implementa; si se
 * agrega una, estas funciones tienen que aprender esa excepción.
 */

/** Si la frase va en singular o en plural. */
export type Numero = "singular" | "plural"

/** Cada determinante en sus cuatro formas, según género y número. */
type Determinantes = Record<Genero, Record<Numero, string>>

const DEFINIDO: Determinantes = {
  m: { singular: "el", plural: "los" },
  f: { singular: "la", plural: "las" },
}

const INDEFINIDO: Determinantes = {
  m: { singular: "un", plural: "unos" },
  f: { singular: "una", plural: "unas" },
}

const DEMOSTRATIVO_CERCANO: Determinantes = {
  m: { singular: "este", plural: "estos" },
  f: { singular: "esta", plural: "estas" },
}

const DEMOSTRATIVO_LEJANO: Determinantes = {
  m: { singular: "ese", plural: "esos" },
  f: { singular: "esa", plural: "esas" },
}

/** "Ningún" sólo existe en singular: "ningunos" y "ningunas" no son español. */
const NINGUNO: Record<Genero, string> = {
  m: "ningún",
  f: "ninguna",
}

/** "Todos los" / "todas las": siempre en plural y siempre con artículo. */
const TODOS_LOS: Record<Genero, string> = {
  m: "todos los",
  f: "todas las",
}

/** El determinante que corresponde al género y al número, seguido del sustantivo. */
function conDeterminante(determinantes: Determinantes, sustantivo: Sustantivo, numero: Numero): string {
  return `${determinantes[sustantivo.genero][numero]} ${sustantivo[numero]}`
}

/** "el cliente" / "la estilista" / "los clientes" / "las estilistas". */
export function el(sustantivo: Sustantivo, numero: Numero = "singular"): string {
  return conDeterminante(DEFINIDO, sustantivo, numero)
}

/** "un barbero" / "una manicurista" / "unos barberos" / "unas manicuristas". */
export function un(sustantivo: Sustantivo, numero: Numero = "singular"): string {
  return conDeterminante(INDEFINIDO, sustantivo, numero)
}

/**
 * "del cliente" / "de la estilista" / "de los clientes" / "de las estilistas".
 * Sólo el masculino singular contrae ("de" + "el" = "del"); en los demás casos
 * "de" va separado del artículo.
 */
export function del(sustantivo: Sustantivo, numero: Numero = "singular"): string {
  if (sustantivo.genero === "m" && numero === "singular") return `del ${sustantivo.singular}`
  return `de ${el(sustantivo, numero)}`
}

/**
 * "al cliente" / "a la estilista" / "a los clientes" / "a las estilistas".
 * Sólo el masculino singular contrae ("a" + "el" = "al").
 */
export function al(sustantivo: Sustantivo, numero: Numero = "singular"): string {
  if (sustantivo.genero === "m" && numero === "singular") return `al ${sustantivo.singular}`
  return `a ${el(sustantivo, numero)}`
}

/** "este cliente" / "esta estilista" / "estos clientes" / "estas estilistas". */
export function este(sustantivo: Sustantivo, numero: Numero = "singular"): string {
  return conDeterminante(DEMOSTRATIVO_CERCANO, sustantivo, numero)
}

/** "ese cliente" / "esa estilista" / "esos clientes" / "esas estilistas". */
export function ese(sustantivo: Sustantivo, numero: Numero = "singular"): string {
  return conDeterminante(DEMOSTRATIVO_LEJANO, sustantivo, numero)
}

/**
 * "ningún cliente" / "ninguna estilista". No recibe número: "ningunos" y
 * "ningunas" no existen, y un segundo parámetro que no existe no deja escribir
 * el plural por error (el compilador lo rechaza).
 */
export function ningun(sustantivo: Sustantivo): string {
  return `${NINGUNO[sustantivo.genero]} ${sustantivo.singular}`
}

/**
 * "todos los clientes" / "todas las estilistas". Siempre en plural y con
 * artículo: "todo el cliente" no se dice. Por eso no recibe número.
 */
export function todos(sustantivo: Sustantivo): string {
  return `${TODOS_LOS[sustantivo.genero]} ${sustantivo.plural}`
}

/**
 * El plural de un adjetivo ya puesto en el género que toca, con las reglas
 * regulares: termina en -z cambia a -ces ("feliz" → "felices"), en -s no
 * cambia ("gratis"), en vocal suma -s ("grande" → "grandes") y en consonante
 * -es ("azul" → "azules"). Las vocales tónicas -á, -é y -ó suman -s ("rosé" →
 * "rosés") y las -í y -ú, -es ("hindú" → "hindúes"), que es la forma culta.
 */
function enPlural(adjetivo: string): string {
  if (adjetivo.endsWith("z")) return `${adjetivo.slice(0, -1)}ces`
  if (adjetivo.endsWith("s")) return adjetivo
  if (/[aeiouáéó]$/.test(adjetivo)) return `${adjetivo}s`
  return `${adjetivo}es`
}

/**
 * Concuerda un adjetivo o un participio con el sustantivo: "nuevo" →
 * "nuevo" / "nueva" / "nuevos" / "nuevas"; "registrado" → "registrada". Los
 * terminados en -o cambian a -a en femenino y suman -s en plural. Los que no
 * terminan en -o ("grande", "azul", "feliz") no cambian de género y sólo
 * toman el plural: "grandes", "azules", "felices".
 *
 * Devuelve sólo el adjetivo, no la frase: dónde va ("nuevo cliente" o
 * "cliente registrado") lo decide quien escribe la pantalla.
 *
 * Límite: sólo adjetivos regulares, escritos en masculino singular y en
 * minúscula. No sabe de los que tienen un femenino propio ("trabajador" →
 * "trabajadora", "español" → "española", "inglés" → "inglesa"), de las formas
 * que se acortan ante el sustantivo ("primero" → "primer") ni de los plurales
 * con cambio de acento ("cortés" → "corteses"): los deja como están. Con uno de
 * esos se escribe la frase a mano.
 */
export function concordar(adjetivo: string, sustantivo: Sustantivo, numero: Numero = "singular"): string {
  const enGenero =
    sustantivo.genero === "f" && adjetivo.endsWith("o") ? `${adjetivo.slice(0, -1)}a` : adjetivo
  return numero === "plural" ? enPlural(enGenero) : enGenero
}
