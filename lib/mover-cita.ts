/**
 * Las advertencias al crear o mover una cita en el panel (su fecha, su hora o
 * su profesional). No bloquean: el endpoint las devuelve y quien agenda
 * decide si guarda igual (`confirmarAdvertencias`). Es cálculo puro: entra lo
 * que ya trajo la base y salen los mensajes.
 *
 * Tres advertencias:
 * - **choque**: el profesional ya tiene otra cita activa que se pisa con el
 *   horario (`lib/ocupacion.ts`: canceladas y "no vino" no ocupan). Sin
 *   profesional asignado no hay con quién chocar.
 * - **bloqueo**: el horario cae en un bloqueo del profesional o de todo el
 *   negocio (`TimeBlock`).
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
import type { BloqueoQueOcupa, Tramo } from "@/lib/ocupacion"

export type { Tramo } from "@/lib/ocupacion"

/** Estados con los que una cita ya no se mueve: lo que pasó, pasó. Si no vino y quiere otra hora, es otra cita. */
export const ESTADOS_QUE_NO_SE_MUEVEN = ["cancelada", "completada", "no-asistio"] as const

export const MENSAJE_CITA_CERRADA = "Una cita cancelada, completada o de alguien que no vino no se puede mover"
export const MENSAJE_CITA_CON_ATENCION =
  "Esta cita ya tiene una atención en el Tablero: no se puede mover. Si fue un error, deshaz la llegada primero"

export function sePuedeMover(estado: string): boolean {
  return !(ESTADOS_QUE_NO_SE_MUEVEN as readonly string[]).includes(estado)
}

export type TipoDeAdvertencia = "choque" | "bloqueo" | "fuera-de-horario"

export interface Advertencia {
  tipo: TipoDeAdvertencia
  mensaje: string
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

/** `20/10 13:00`: día y hora en el reloj del negocio. */
function diaYHora(instante: Date, zona: string): string {
  const { fecha, minutos } = fechaYMinutosEn(instante, zona)
  const [, mes, dia] = fecha.split("-")
  return `${dia}/${mes} ${minutosAHora(minutos)}`
}

/**
 * `de 13:00 a 14:00 (Almuerzo)`, o `del 20/10 09:00 al 22/10 18:00` si dura
 * más de un día: un bloqueo para leer, con su motivo si tiene.
 */
function bloqueoParaLeer(bloqueo: BloqueoQueOcupa, zona: string): string {
  const motivo = bloqueo.motivo?.trim()
  const mismoDia = fechaYMinutosEn(bloqueo.startTime, zona).fecha === fechaYMinutosEn(bloqueo.endTime, zona).fecha
  const cuando = mismoDia
    ? `de ${tramoParaLeer(bloqueo, zona)}`
    : `del ${diaYHora(bloqueo.startTime, zona)} al ${diaYHora(bloqueo.endTime, zona)}`
  return `${cuando}${motivo ? ` (${motivo})` : ""}`
}

/**
 * "Carla tiene bloqueado de 13:00 a 14:00 (Almuerzo)." y "El negocio tiene
 * bloqueado de 09:00 a 18:00 (Feriado)." — o `null` si no cae en ningún bloqueo.
 * `nombre` es el del profesional de la cita (null si va sin asignar).
 */
export function advertenciaDeBloqueo(
  nombre: string | null,
  bloqueos: BloqueoQueOcupa[],
  zona: string
): Advertencia | null {
  if (bloqueos.length === 0) return null
  const ordenados = [...bloqueos].sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
  const delNegocio = ordenados.filter((bloqueo) => bloqueo.memberId === null)
  const propios = ordenados.filter((bloqueo) => bloqueo.memberId !== null)
  const frases: string[] = []
  if (propios.length > 0) {
    frases.push(`${nombre ?? "El profesional"} tiene bloqueado ${enumerar(propios.map((b) => bloqueoParaLeer(b, zona)))}.`)
  }
  if (delNegocio.length > 0) {
    frases.push(`El negocio tiene bloqueado ${enumerar(delNegocio.map((b) => bloqueoParaLeer(b, zona)))}.`)
  }
  return { tipo: "bloqueo", mensaje: frases.join(" ") }
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
