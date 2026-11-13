/**
 * Las sedes en la Agenda (etapa 9, plan Independiente). Es lógica sin pantalla:
 * qué sedes tiene el negocio, si la agenda las muestra y qué dice de cada hora.
 *
 * La agenda sólo cambia con **varias sedes** (`modoDeSedes`: el plan
 * Independiente con dos o más sedes activas). Con una sola o ninguna (todo
 * negocio de hoy y todo plan Equipo) queda exactamente como siempre: ni la
 * tarjeta, ni el detalle, ni el modal de nueva hora dicen nada de sedes. Quien
 * decide el modo es el servidor (el layout de la agenda, con las sedes del
 * negocio de la sesión): la pantalla no compara planes ni roles.
 */

import type { FranjaDelDia } from "@/lib/horario-de-atencion"
import type { FranjaHorario } from "@/lib/horario-dia"
import type { ModoDeSedes } from "@/lib/sedes"
import { diaDeLaSemana } from "@/lib/zona-horaria"

/** Una sede activa, como la ofrece el selector del modal de nueva hora. */
export interface SedeDeLaAgenda {
  id: string
  nombre: string
}

/** Lo que el servidor le pasa a la agenda: el modo y las sedes activas, en el orden de la lista. */
export interface SedesDeLaAgenda {
  modo: ModoDeSedes
  /** Las sedes ACTIVAS. Vacía en el modo `una` cuando no hay sedes; con una sola, ella (no se ofrece elegir). */
  sedes: SedeDeLaAgenda[]
}

/** Sin sedes: la agenda de siempre. Es lo que vale sin proveedor (y en las pruebas). */
export const SIN_SEDES: SedesDeLaAgenda = { modo: "una", sedes: [] }

/**
 * El nombre de la sede que se muestra en una hora (la insignia junto a la hora
 * y la ficha), o `null` si no se dice nada: con una sola sede o ninguna la
 * agenda no la nombra, y una hora sin sede (de antes de que el negocio tuviera
 * sedes) tampoco.
 */
export function sedeParaMostrar(cita: { sede?: { nombre: string } | null }, modo: ModoDeSedes): string | null {
  if (modo !== "varias") return null
  return cita.sede?.nombre?.trim() || null
}

/** Las opciones del selector de sede del modal, en el orden de la lista. */
export function opcionesDeSede(sedes: readonly SedeDeLaAgenda[]): { valor: string; texto: string }[] {
  return sedes.map((sede) => ({ valor: sede.id, texto: sede.nombre }))
}

/**
 * La sede de un borrador nuevo: vacía ("" = todavía sin elegir) con varias
 * sedes, y sin la clave en cualquier otro caso, para que la hora se cree como
 * siempre. Igual que el sillón de la clínica.
 */
export function sedeDelBorrador(modo: ModoDeSedes): { sedeId?: string } {
  return modo === "varias" ? { sedeId: "" } : {}
}

/**
 * Las franjas con que atiende la sede el día `fecha` ("AAAA-MM-DD", del
 * negocio), de la más temprana a la más tarde. `horario` es el semanal de la
 * sede (`GET /api/citas/horario-de-atencion?sedeId=`). Vacía: ese día no
 * atiende. Una fecha que no es un día real tampoco da franjas.
 */
export function franjasDeLaSedeEseDia(horario: readonly FranjaDelDia[], fecha: string): FranjaHorario[] {
  let dia: number
  try {
    dia = diaDeLaSemana(fecha)
  } catch {
    return []
  }
  return horario
    .filter((franja) => franja.dayOfWeek === dia)
    .map(({ startTime, endTime }) => ({ startTime, endTime }))
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
}
