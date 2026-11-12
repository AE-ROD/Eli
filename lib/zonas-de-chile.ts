/**
 * Las zonas horarias que un negocio de Eli puede elegir (`Business.timezone`):
 * las tres de Chile, con su nombre en español. Una lista corta y fija a
 * propósito: sólo estas tres se aceptan al guardar.
 *
 * Puro, sin base ni sesión; la validación de que el motor conoce la zona y el
 * cálculo de la hora salen de `lib/zona-horaria.ts`.
 */

import { ZONA_POR_DEFECTO, esZonaValida, fechaYMinutosEn, zonaDelNegocio } from "@/lib/zona-horaria"

export interface ZonaDeChile {
  /** El nombre IANA que se guarda en `Business.timezone`. */
  id: string
  /** Cómo se llama para quien la elige. */
  nombre: string
  /** Quiénes están en ella, en una línea. */
  detalle: string
}

export const ZONAS_DE_CHILE = [
  { id: "America/Santiago", nombre: "Chile continental", detalle: "Todo el país, salvo Magallanes e Isla de Pascua" },
  { id: "America/Punta_Arenas", nombre: "Magallanes", detalle: "Región de Magallanes y de la Antártica Chilena" },
  { id: "Pacific/Easter", nombre: "Isla de Pascua", detalle: "Rapa Nui" },
] as const satisfies readonly ZonaDeChile[]

export type IdDeZonaDeChile = (typeof ZONAS_DE_CHILE)[number]["id"]

/** Los ids, en el orden de la lista: lo que acepta el servidor. */
export const IDS_DE_ZONAS_DE_CHILE = ZONAS_DE_CHILE.map((zona) => zona.id) as [IdDeZonaDeChile, ...IdDeZonaDeChile[]]

/** Si es una de las tres zonas de la lista. Distingue mayúsculas, como el nombre IANA. */
export function esZonaDeChile(valor: unknown): valor is IdDeZonaDeChile {
  return typeof valor === "string" && (IDS_DE_ZONAS_DE_CHILE as readonly string[]).includes(valor)
}

/**
 * Si se puede guardar: es de la lista y además este motor la conoce
 * (`esZonaValida`). Sin lo segundo, una zona que el motor no sabe leer se
 * guardaría y todo el negocio seguiría calculando en Santiago sin decirlo
 * (`zonaDelNegocio` cae al default).
 */
export function esZonaGuardable(valor: unknown): valor is IdDeZonaDeChile {
  return esZonaDeChile(valor) && esZonaValida(valor)
}

/**
 * La zona con la que trabaja hoy un negocio, para mostrarla: la guardada si el
 * motor la conoce, o la de Santiago si no (lo que usa el resto de la
 * aplicación, `zonaDelNegocio`). `propia` dice si está en la lista; si no (un
 * dato puesto a mano, de antes de esta pantalla), la pantalla lo avisa en vez
 * de marcar una zona que no es.
 */
export function zonaVigente(guardada: string | null | undefined): { id: string; propia: boolean } {
  const id = zonaDelNegocio(guardada)
  return { id, propia: esZonaDeChile(id) }
}

/** La zona de la lista por su id, o `null`. */
export function zonaDeChilePorId(id: string): (typeof ZONAS_DE_CHILE)[number] | null {
  return ZONAS_DE_CHILE.find((zona) => zona.id === id) ?? null
}

/**
 * La hora de pared de la zona en ese instante, "HH:MM" (24 horas). Una zona
 * que el motor no conoce se lee en la de Santiago, como en el resto de la
 * aplicación.
 */
export function horaActualEn(ahora: Date, zona: string): string {
  const { minutos } = fechaYMinutosEn(ahora, zona || ZONA_POR_DEFECTO)
  const dosCifras = (n: number) => String(n).padStart(2, "0")
  return `${dosCifras(Math.floor(minutos / 60))}:${dosCifras(minutos % 60)}`
}
