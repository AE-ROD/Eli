/**
 * Lo que la página del enlace de gestión le pide al servidor: la cita, sus
 * horas libres para reagendar, cancelar y reagendar. Todo por el token del
 * enlace; devuelve `Resultado` en vez de lanzar (`lib/peticiones.ts`).
 */

import type { PrecioDeLaHora } from "@/lib/hora-valle"
import { conJson, pedir, pedirConCodigo, type Resultado, type ResultadoConCodigo } from "@/lib/peticiones"
import type { HorasDelDia } from "../../_componentes/selector-fecha-hora"
import { frasesDeLaGestion } from "../../_frases"

export interface CitaDelEnlace {
  negocio: { nombre: string }
  servicio: { nombre: string; duracion: number | null }
  /** Lo que cuesta hoy (`null` sin precio). */
  precio: number | null
  profesional: string | null
  /** `AAAA-MM-DD` y `HH:MM`, en el reloj del negocio. */
  fecha: string
  hora: string
  zona: string
  plazoHoras: number
  sePuedeCambiar: boolean
  sePuedeReagendar: boolean
  /** Los días de la semana (0 domingo a 6 sábado) que se pueden elegir al reagendar; `null`: todos. */
  diasConAtencion: number[] | null
  /** Clínica dental: es una urgencia y sólo se mueve a otra hora de hoy. Sólo viene en ese caso. */
  soloHoy?: boolean
  /**
   * Plan Independiente: la sede donde se atiende la cita, con su dirección y los
   * enlaces de "Cómo llegar". Sólo viene si la cita tiene sede: sin ella (un
   * negocio sin sedes, o una cita de antes) la pantalla es la de siempre.
   */
  sede?: {
    nombre: string
    direccion: string
    comuna: string
    mapas: { googleMaps: string; waze: string } | null
  }
}

const ruta = (slug: string, token: string, resto = "") =>
  `/api/reservar/${encodeURIComponent(slug)}/cita/${encodeURIComponent(token)}${resto}`

/**
 * Con el código: un 404 es "este enlace no sirve", no un error de conexión.
 * `rubro` (`Business.type`) pone la palabra de la reserva en lo que se dice si
 * el servidor no dio otro motivo ("No se pudo cargar tu hora"); sin él, la de siempre.
 */
export async function leerCita(
  slug: string,
  token: string,
  rubro?: string | null
): Promise<ResultadoConCodigo<CitaDelEnlace>> {
  return pedirConCodigo<CitaDelEnlace>(ruta(slug, token), frasesDeLaGestion(rubro).errores.cargar)
}

/** Las horas libres y, con hora valle (#89c), las que dejarían la cita con otro precio. */
export async function leerHorasParaReagendar(slug: string, token: string, fecha: string): Promise<Resultado<HorasDelDia>> {
  const resultado = await pedir<{ slots: string[]; precios?: PrecioDeLaHora[] }>(
    ruta(slug, token, `/disponibilidad?${new URLSearchParams({ fecha })}`),
    "No se pudieron cargar los horarios disponibles"
  )
  return resultado.ok
    ? { ok: true, datos: { horas: resultado.datos.slots, precios: resultado.datos.precios ?? [] } }
    : resultado
}

export async function cancelarCita(slug: string, token: string, rubro?: string | null): Promise<Resultado> {
  return pedir(ruta(slug, token, "/cancelar"), frasesDeLaGestion(rubro).errores.cancelar, { method: "POST" })
}

export async function reagendarCita(
  slug: string,
  token: string,
  fecha: string,
  hora: string,
  rubro?: string | null
): Promise<Resultado<{ fecha: string; hora: string; profesional: string | null; precio: number | null }>> {
  return pedir(ruta(slug, token, "/reagendar"), frasesDeLaGestion(rubro).errores.cambiar, conJson("POST", { fecha, hora }))
}
