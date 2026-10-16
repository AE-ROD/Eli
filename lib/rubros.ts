/**
 * Los rubros que Eli atiende. Única fuente de verdad: las pantallas que dejan
 * elegir el rubro (crear cuenta, completar perfil) y las validaciones del
 * servidor leen de acá, así que un rubro nuevo se agrega en un solo lugar.
 *
 * El `id` es lo que se guarda en `Business.type`. `salon` se conserva tal cual
 * porque ya está guardado en negocios reales: cambiarlo dejaría a esos negocios
 * con un rubro que el catálogo no conoce.
 */
export const RUBROS = [
  { id: "salon", nombre: "Salón de belleza", icono: "💇" },
  { id: "barberia", nombre: "Barbería", icono: "💈" },
  { id: "spa-de-unas", nombre: "Spa de uñas", icono: "💅" },
] as const

export type RubroId = (typeof RUBROS)[number]["id"]

/**
 * Los ids como tupla no vacía, que es lo que pide `z.enum`. El cast no abre
 * nada: `RUBROS` es un literal con elementos, y el tipo sale de él.
 */
export const IDS_DE_RUBROS = RUBROS.map((rubro) => rubro.id) as [RubroId, ...RubroId[]]

/** Lo que se muestra cuando el id guardado ya no está en el catálogo. */
const RUBRO_DESCONOCIDO = "Otro rubro"

/**
 * El nombre para mostrar de un rubro. Nunca rompe con un id desconocido: en la
 * base hay negocios con ids de cuando Eli apuntaba a otros rubros (`salud`,
 * `fitness`, `otro`), y a esos se les muestra un texto neutro en vez de un
 * error o un hueco.
 *
 * Busca con `find` y no con un objeto indexado a propósito: un id como
 * `constructor` devolvería una función del prototipo en vez de caer al texto
 * neutro.
 */
export function nombreDeRubro(id: string): string {
  return RUBROS.find((rubro) => rubro.id === id)?.nombre ?? RUBRO_DESCONOCIDO
}
