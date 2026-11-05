/**
 * Todo lo que la pantalla de Comisiones le pide al servidor, y cómo se lee y
 * se escribe un %. La pantalla llama a estas funciones y no conoce ninguna
 * URL. Cada una devuelve un `Resultado` (`lib/peticiones.ts`) en vez de lanzar.
 */

import { conJson, pedir, type Resultado } from "@/lib/peticiones"

export interface ExcepcionDeComision {
  servicioId: string
  servicio: string
  porcentaje: number
}

export interface MiembroConComision {
  id: string
  nombre: string
  rol: string
  /** `null`: sin configurar (no es 0). */
  porcentaje: number | null
  excepciones: ExcepcionDeComision[]
  /** Servicios ya cobrados de este profesional que esperan un %. */
  pendientes: number
}

export interface DatosDeComisiones {
  miembros: MiembroConComision[]
  servicios: { id: string; nombre: string; activo: boolean }[]
  productos: { id: string; nombre: string; porcentaje: number | null; activo: boolean }[]
  /** Hay más pendientes de los que el servidor cuenta de una vez. */
  pendientesTruncado: boolean
}

export interface CambioDeComision {
  id: string
  cuando: string
  /** `id` en null: ya no está en el equipo (el nombre quedó copiado). */
  miembro: { id: string | null; nombre: string }
  alcance: "default" | "service" | "product"
  /** El servicio o producto del cambio; null en el % por defecto. */
  sobre: string | null
  quien: string
  antes: number | null
  despues: number | null
}

export interface HistorialDeComisiones {
  cambios: CambioDeComision[]
  total: number
  pagina: number
  paginas: number
  /** Los nombres de quienes ya no están en el equipo y tienen cambios: se pueden elegir en el filtro. */
  exMiembros: string[]
}

/**
 * El filtro del historial: todo el equipo (vacío), un profesional del equipo
 * (por id) o alguien que ya se fue (por el nombre que quedó copiado, #119).
 */
export interface FiltroDeHistorial {
  miembro?: string
  exMiembro?: string
}

export async function leerComisiones(): Promise<Resultado<DatosDeComisiones>> {
  return pedir<DatosDeComisiones>("/api/comisiones", "No se pudieron cargar las comisiones")
}

export async function leerHistorial(
  filtro: FiltroDeHistorial,
  pagina: number
): Promise<Resultado<HistorialDeComisiones>> {
  const parametros = new URLSearchParams({ pagina: String(pagina) })
  if (filtro.miembro) parametros.set("miembro", filtro.miembro)
  else if (filtro.exMiembro) parametros.set("exMiembro", filtro.exMiembro)
  return pedir<HistorialDeComisiones>(`/api/comisiones/historial?${parametros}`, "No se pudo cargar el historial")
}

type Guardado = Resultado<{ porcentaje: number | null; cambio: boolean }>

/** El % por defecto de un profesional; `null` lo deja sin configurar. */
export async function guardarPorcentajeDeMiembro(miembroId: string, porcentaje: number | null): Promise<Guardado> {
  return pedir(
    `/api/comisiones/miembros/${encodeURIComponent(miembroId)}`,
    "No se pudo guardar el porcentaje",
    conJson("PUT", { porcentaje })
  )
}

/** La excepción de un profesional en un servicio; `null` la quita. */
export async function guardarExcepcion(
  miembroId: string,
  servicioId: string,
  porcentaje: number | null
): Promise<Guardado> {
  return pedir(
    `/api/comisiones/miembros/${encodeURIComponent(miembroId)}/servicios/${encodeURIComponent(servicioId)}`,
    porcentaje === null ? "No se pudo quitar la excepción" : "No se pudo guardar la excepción",
    conJson("PUT", { porcentaje })
  )
}

// ─── Leer y mostrar un % ─────────────────────────────────────────────────────

/**
 * Lo que se escribió en un campo de %: vacío es `null` (sin configurar); un
 * número de 0 a 100 con hasta dos decimales, con coma o punto ("33,33"), es
 * ese número; cualquier otra cosa no se adivina y es un error.
 */
export function leerPorcentaje(texto: string): { ok: true; valor: number | null } | { ok: false; error: string } {
  const limpio = texto.trim().replace(/\s*%$/, "")
  if (limpio === "") return { ok: true, valor: null }
  if (!/^\d{1,3}([.,]\d{1,2})?$/.test(limpio)) {
    return { ok: false, error: "Escribe un número de 0 a 100, con hasta dos decimales (por ejemplo 40 o 33,33)." }
  }
  const valor = Number(limpio.replace(",", "."))
  if (valor > 100) return { ok: false, error: "El porcentaje no puede pasar de 100." }
  return { ok: true, valor }
}

/** `33,33 %`, o "Sin configurar" si es null. */
export function formatearPorcentaje(porcentaje: number | null): string {
  if (porcentaje === null) return "Sin configurar"
  return `${porcentaje.toLocaleString("es-CL", { maximumFractionDigits: 2 })} %`
}

/** Cómo se escribe un % guardado en el campo para editarlo: `33,33`, o vacío. */
export function porcentajeParaEscribir(porcentaje: number | null): string {
  return porcentaje === null ? "" : porcentaje.toLocaleString("es-CL", { maximumFractionDigits: 2, useGrouping: false })
}
