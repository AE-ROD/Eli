/**
 * Lo que la página del enlace de gestión le pide al servidor: la cita, sus
 * horas libres para reagendar, cancelar y reagendar. Todo por el token del
 * enlace; devuelve `Resultado` en vez de lanzar (`lib/peticiones.ts`).
 */

import { conJson, pedir, pedirConCodigo, type Resultado, type ResultadoConCodigo } from "@/lib/peticiones"

export interface CitaDelEnlace {
  negocio: { nombre: string }
  servicio: { nombre: string; duracion: number | null }
  profesional: string | null
  /** `AAAA-MM-DD` y `HH:MM`, en el reloj del negocio. */
  fecha: string
  hora: string
  zona: string
  plazoHoras: number
  sePuedeCambiar: boolean
  sePuedeReagendar: boolean
  /** Días de la semana (0 domingo a 6 sábado) con atención para reagendar; vacío si no se puede. */
  diasConAtencion: number[]
}

const ruta = (slug: string, token: string, resto = "") =>
  `/api/reservar/${encodeURIComponent(slug)}/cita/${encodeURIComponent(token)}${resto}`

/** Con el código: un 404 es "este enlace no sirve", no un error de conexión. */
export async function leerCita(slug: string, token: string): Promise<ResultadoConCodigo<CitaDelEnlace>> {
  return pedirConCodigo<CitaDelEnlace>(ruta(slug, token), "No se pudo cargar tu cita")
}

export async function leerHorasParaReagendar(slug: string, token: string, fecha: string): Promise<Resultado<string[]>> {
  const resultado = await pedir<{ slots: string[] }>(
    ruta(slug, token, `/disponibilidad?${new URLSearchParams({ fecha })}`),
    "No se pudieron cargar los horarios disponibles"
  )
  return resultado.ok ? { ok: true, datos: resultado.datos.slots } : resultado
}

export async function cancelarCita(slug: string, token: string): Promise<Resultado> {
  return pedir(ruta(slug, token, "/cancelar"), "No se pudo cancelar la cita", { method: "POST" })
}

export async function reagendarCita(
  slug: string,
  token: string,
  fecha: string,
  hora: string
): Promise<Resultado<{ fecha: string; hora: string; profesional: string | null }>> {
  return pedir(ruta(slug, token, "/reagendar"), "No se pudo cambiar la cita", conJson("POST", { fecha, hora }))
}
