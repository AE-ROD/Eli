/**
 * La agenda en la hora del negocio (#99). Las citas y los bloqueos son
 * instantes; el negocio los vive en su zona (`Business.timezone`). Antes la
 * agenda los leía y los escribía en la zona del navegador: quien miraba desde
 * otro huso (de viaje, o un equipo con el reloj mal puesto) veía las citas
 * corridas y, al crear o mover una, la guardaba en otra hora.
 *
 * Los días que se miran siguen viajando como `Date` a la medianoche local
 * (lo que usa `lib/fechas.ts` para semanas y meses): ahí el `Date` es sólo
 * un día calendario, y `comoTexto` lo convierte en "AAAA-MM-DD" del negocio.
 * Lo que es un instante pasa siempre por acá, con la zona.
 */

import { comoTexto, deTexto } from "@/lib/fechas"
import { esFechaCalendario, esHoraDelDia, fechaYMinutosEn, instanteEn } from "@/lib/zona-horaria"

const dosCifras = (n: number) => String(n).padStart(2, "0")

/** "09:05": la hora que marca el reloj del negocio en ese instante. */
export function horaEn(iso: string, zona: string): string {
  const { minutos } = fechaYMinutosEn(new Date(iso), zona)
  return `${dosCifras(Math.floor(minutos / 60))}:${dosCifras(minutos % 60)}`
}

/** "AAAA-MM-DD": el día del negocio en que cae ese instante. */
export function fechaEn(iso: string, zona: string): string {
  return fechaYMinutosEn(new Date(iso), zona).fecha
}

/** Si el instante cae en el día `dia` del negocio. */
export function caeEnElDia(iso: string, dia: Date, zona: string): boolean {
  return fechaEn(iso, zona) === comoTexto(dia)
}

/** Hoy para el negocio, como el `Date` (medianoche local) con que la agenda lleva los días. */
export function hoyEn(zona: string, ahora: Date = new Date()): Date {
  // `deTexto` no falla con una fecha que sale del reloj; el `??` es por si acaso.
  return deTexto(fechaYMinutosEn(ahora, zona).fecha) ?? new Date(ahora)
}

/** Si `dia` es hoy para el negocio. */
export function esHoyEn(dia: Date, zona: string, ahora: Date = new Date()): boolean {
  return comoTexto(dia) === fechaYMinutosEn(ahora, zona).fecha
}

/**
 * El instante ISO en que el reloj del negocio marca esa fecha y esa hora
 * (como las entregan `<input type="date">` y `<input type="time">`), o
 * `null` si no son válidas.
 */
export function isoEn(fecha: string, hora: string, zona: string): string | null {
  if (!esFechaCalendario(fecha) || !esHoraDelDia(hora)) return null
  return instanteEn(fecha, hora, zona).toISOString()
}

/** `lunes, 8 de marzo`: el día del negocio en que cae ese instante, para leerlo. */
export function diaLargoEn(iso: string, zona: string): string {
  const dia = deTexto(fechaEn(iso, zona))
  return dia ? dia.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" }) : ""
}
