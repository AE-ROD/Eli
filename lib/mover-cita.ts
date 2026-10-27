/**
 * Las advertencias al mover una cita (cambiar su fecha, su hora o su
 * profesional). No bloquean: el endpoint las devuelve y quien mueve decide si
 * guarda igual (`confirmarAdvertencias`). Es cálculo puro: entra lo que ya
 * trajo la base y salen los mensajes.
 *
 * Dos advertencias:
 * - **choque**: el profesional ya tiene otra cita que se pisa con el nuevo
 *   horario. Sin profesional asignado no hay con quién chocar.
 * - **fuera de horario**: el tramo no cabe entero en el horario de atención
 *   del profesional ese día. Si el profesional cargó horario propio (en
 *   cualquier día), manda el suyo; si no, el del negocio, con la misma regla
 *   que la reserva pública (`franjasDeAtencion`). Si el negocio no cargó
 *   ningún horario, no hay contra qué comparar y no se advierte.
 *
 * Las horas se leen en el reloj del negocio (`Business.timezone`), no en el
 * del servidor.
 */

import { franjasDeAtencion, cabeEnAtencion, type FilaDeHorarioSemanal } from "@/lib/horario-de-atencion"
import { minutosAHora, type FranjaHorario } from "@/lib/horario-dia"
import { diaDeLaSemana, fechaYMinutosEn } from "@/lib/zona-horaria"

/** Estados con los que una cita ya no se mueve: lo que pasó, pasó. */
export const ESTADOS_QUE_NO_SE_MUEVEN = ["cancelada", "completada"] as const

export const MENSAJE_CITA_CERRADA = "Una cita cancelada o completada no se puede mover"
export const MENSAJE_CITA_CON_ATENCION =
  "Esta cita ya tiene una atención en el Tablero: no se puede mover. Si fue un error, deshaz la llegada primero"

export function sePuedeMover(estado: string): boolean {
  return !(ESTADOS_QUE_NO_SE_MUEVEN as readonly string[]).includes(estado)
}

export type TipoDeAdvertencia = "choque" | "fuera-de-horario"

export interface Advertencia {
  tipo: TipoDeAdvertencia
  mensaje: string
}

export interface Tramo {
  startTime: Date
  endTime: Date
}

/** `10:00 a 11:00`, en el reloj del negocio. */
function tramoParaLeer(tramo: Tramo, zona: string): string {
  const inicio = minutosAHora(fechaYMinutosEn(tramo.startTime, zona).minutos)
  const fin = minutosAHora(fechaYMinutosEn(tramo.endTime, zona).minutos)
  return `${inicio} a ${fin}`
}

/** `a, b y c`. */
function enumerar(partes: string[]): string {
  if (partes.length <= 1) return partes.join("")
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`
}

/** Si dos tramos se pisan. Tocarse (una termina 10:00, la otra empieza 10:00) no es pisarse. */
export function sePisan(a: Tramo, b: Tramo): boolean {
  return a.startTime.getTime() < b.endTime.getTime() && b.startTime.getTime() < a.endTime.getTime()
}

/** "Carla ya tiene una cita de 10:00 a 11:00." — o `null` si no hay choque. */
export function advertenciaDeChoque(nombre: string, choques: Tramo[], zona: string): Advertencia | null {
  if (choques.length === 0) return null
  const ordenados = [...choques].sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
  const tramos = ordenados.map((tramo) => `de ${tramoParaLeer(tramo, zona)}`)
  const mensaje =
    ordenados.length === 1
      ? `${nombre} ya tiene una cita ${tramos[0]}.`
      : `${nombre} ya tiene citas ${enumerar(tramos)}.`
  return { tipo: "choque", mensaje }
}

/**
 * Las franjas contra las que se compara: las del profesional si cargó horario
 * propio, si no las del negocio. `null` si el negocio no tiene ningún horario.
 */
export function franjasParaElDia(
  filas: FilaDeHorarioSemanal[],
  memberId: string | null,
  dayOfWeek: number
): { franjas: FranjaHorario[]; propias: boolean } | null {
  if (filas.length === 0) return null
  const propias = !!memberId && filas.some((fila) => fila.memberId === memberId)
  const delDia = filas.filter((fila) => fila.dayOfWeek === dayOfWeek)
  const franjas = propias
    ? franjasDeAtencion(delDia.filter((fila) => fila.memberId === memberId))
    : franjasDeAtencion(delDia)
  return { franjas, propias }
}

/**
 * Si el tramo queda fuera del horario de atención. `nombre` es el del
 * profesional (se usa si tiene horario propio). `filas` son las activas del
 * negocio, de toda la semana.
 */
export function advertenciaDeHorario(
  tramo: Tramo,
  filas: FilaDeHorarioSemanal[],
  memberId: string | null,
  nombre: string | null,
  zona: string
): Advertencia | null {
  const inicio = fechaYMinutosEn(tramo.startTime, zona)
  const resultado = franjasParaElDia(filas, memberId, diaDeLaSemana(inicio.fecha))
  if (!resultado) return null

  // Por duración y no por la hora de fin: una cita que pasa la medianoche da
  // un fin de más de 1440 minutos, que no cabe en ninguna franja.
  const duracion = Math.round((tramo.endTime.getTime() - tramo.startTime.getTime()) / 60000)
  if (cabeEnAtencion(resultado.franjas, inicio.minutos, inicio.minutos + duracion)) return null

  const quien = resultado.propias && nombre ? nombre : "El negocio"
  const de = resultado.propias && nombre ? `de ${nombre}` : "del negocio"
  const mensaje =
    resultado.franjas.length === 0
      ? `${quien} no atiende ese día.`
      : `La cita queda fuera del horario de atención ${de} (${enumerar(
          resultado.franjas.map((franja) => `${franja.startTime} a ${franja.endTime}`)
        )}).`
  return { tipo: "fuera-de-horario", mensaje }
}
