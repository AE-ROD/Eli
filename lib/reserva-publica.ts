/**
 * Las reglas de la reserva pública que no son el horario de atención: cuándo
 * se puede reservar. Puro: entra el reloj y la zona del negocio, sale la
 * respuesta. Lo usan `disponibilidad` (qué horas se ofrecen) y `confirmar`
 * (qué horas se aceptan), con la misma regla para que nunca den distinto.
 */

import { horaAMinutos } from "@/lib/horario-dia"
import { diasEntre, fechaYMinutosEn } from "@/lib/zona-horaria"

/**
 * Hasta cuántos días después de hoy (en el reloj del negocio) se puede
 * reservar, hoy incluido como día 0. Sin tope, una sola persona podía llenar
 * la agenda de años futuros.
 */
export const DIAS_MAXIMOS_DE_ANTICIPACION = 90

export const MENSAJE_HORA_PASADA = "Ese horario ya pasó. Elige otra hora."
export const MENSAJE_FECHA_PASADA = "Esa fecha ya pasó. Elige otro día."
export const MENSAJE_FECHA_MUY_LEJANA = `Se puede reservar hasta ${DIAS_MAXIMOS_DE_ANTICIPACION} días por adelantado. Elige una fecha más cercana.`

/** Por qué una fecha no se puede reservar, o `null` si se puede. */
export type FechaNoReservable = "pasada" | "muy-lejana"

/**
 * Si el día `fecha` cae fuera de lo reservable: antes de hoy o a más de
 * `DIAS_MAXIMOS_DE_ANTICIPACION` días de hoy, con "hoy" en el reloj de la
 * zona. La fecha tiene que venir validada (`esFechaCalendario`).
 */
export function fechaNoReservable(fecha: string, ahora: Date, zona: string): FechaNoReservable | null {
  const dias = diasEntre(fechaYMinutosEn(ahora, zona).fecha, fecha)
  if (dias < 0) return "pasada"
  if (dias > DIAS_MAXIMOS_DE_ANTICIPACION) return "muy-lejana"
  return null
}

/**
 * Si la hora `hora` ("HH:MM") de `fecha` ya pasó en el reloj de la zona. La
 * hora en curso cuenta como pasada: a las 10:30 ya no se reserva a las 10:30.
 * Es la regla con la que `disponibilidad` siempre filtró las horas de hoy.
 */
export function yaPasoLaHora(fecha: string, hora: string, ahora: Date, zona: string): boolean {
  const hoy = fechaYMinutosEn(ahora, zona)
  const dias = diasEntre(hoy.fecha, fecha)
  if (dias !== 0) return dias < 0
  return horaAMinutos(hora) <= hoy.minutos
}
