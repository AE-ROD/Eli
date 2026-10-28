import type { Prisma } from "@prisma/client"

/**
 * Qué ocupa el tiempo de un profesional (o del negocio entero) en un rango:
 * sus citas activas y los bloqueos (`TimeBlock`) suyos o de todo el negocio.
 * Es la única definición de "ese horario está tomado": la usan el panel al
 * crear y al mover una cita (como advertencia que se puede confirmar) y la
 * usará la reserva pública para ofrecer horas por profesional (como regla
 * que no se salta).
 *
 * API
 * ───
 * - `ESTADOS_QUE_LIBERAN` / `ocupaElHorario(estado)`: una cita cancelada o
 *   de alguien que no vino ("no-asistio") no ocupa el horario.
 * - `wheresDeOcupacion(consulta)`: los `where` de Prisma para leer citas y
 *   bloqueos que se pisan con el rango. Puros, para quien arme su consulta
 *   (por ejemplo dentro de una transacción con candado).
 * - `leerOcupacion(db, consulta)`: lee las dos cosas con un cliente de Prisma
 *   o el `tx` de una transacción. No importa la base: se la pasan.
 * - `conflictosDelTramo(ocupacion, tramo)`: de lo leído, lo que se pisa con
 *   un tramo. Puro: se lee el día una vez y se prueba cada hora.
 * - `estaLibre(ocupacion, tramo)`: si no hay ningún conflicto.
 *
 * Reglas
 * ──────
 * - Siempre acotado a `businessId`: nada de otro negocio entra, ni por un
 *   `memberId` ajeno.
 * - `memberId` es el profesional. Con uno: sus citas activas y los bloqueos
 *   suyos y los de todo el negocio (`memberId` null). Con `null` (cita sin
 *   asignar): ninguna cita (no hay con quién chocar) y sólo los bloqueos de
 *   todo el negocio.
 * - Pisarse es compartir algún instante: [inicio, fin) contra [inicio, fin).
 *   Tocarse (una termina 10:00 y la otra empieza 10:00) no es pisarse.
 * - `ignorarCitaId`: la cita que se está moviendo no choca consigo misma.
 */

/** Estados con los que una cita deja libre su horario. */
export const ESTADOS_QUE_LIBERAN = ["cancelada", "no-asistio"] as const

export function ocupaElHorario(estado: string): boolean {
  return !(ESTADOS_QUE_LIBERAN as readonly string[]).includes(estado)
}

export interface Tramo {
  startTime: Date
  endTime: Date
}

/** Si dos tramos se pisan. Tocarse no es pisarse. */
export function sePisan(a: Tramo, b: Tramo): boolean {
  return a.startTime.getTime() < b.endTime.getTime() && b.startTime.getTime() < a.endTime.getTime()
}

export interface ConsultaDeOcupacion {
  businessId: string
  /** El profesional; `null` es "sin asignar" (sólo cuentan los bloqueos de todo el negocio). */
  memberId: string | null
  /** El rango a mirar, [desde, hasta). */
  desde: Date
  hasta: Date
  /** La cita que se está moviendo: no choca consigo misma. */
  ignorarCitaId?: string | null
}

export interface CitaQueOcupa extends Tramo {
  id: string
  memberId: string | null
  status: string
}

export interface BloqueoQueOcupa extends Tramo {
  id: string
  /** `null`: bloqueo de todo el negocio. */
  memberId: string | null
  motivo: string | null
}

export interface Ocupacion {
  citas: CitaQueOcupa[]
  bloqueos: BloqueoQueOcupa[]
}

/** Los `where` de Prisma de una consulta de ocupación. */
export function wheresDeOcupacion(consulta: ConsultaDeOcupacion): {
  citas: Prisma.AppointmentWhereInput | null
  bloqueos: Prisma.TimeBlockWhereInput
} {
  const { businessId, memberId, desde, hasta, ignorarCitaId } = consulta
  const sePisaConElRango = { startTime: { lt: hasta }, endTime: { gt: desde } }

  const citas: Prisma.AppointmentWhereInput | null = memberId
    ? {
        businessId,
        memberId,
        status: { notIn: [...ESTADOS_QUE_LIBERAN] },
        ...(ignorarCitaId ? { id: { not: ignorarCitaId } } : {}),
        ...sePisaConElRango,
      }
    : null

  const bloqueos: Prisma.TimeBlockWhereInput = {
    businessId,
    ...(memberId ? { OR: [{ memberId }, { memberId: null }] } : { memberId: null }),
    ...sePisaConElRango,
  }

  return { citas, bloqueos }
}

/**
 * El cliente de Prisma o el `tx` de una transacción: sólo se usan citas y
 * bloqueos. Se recibe en vez de importarse para que el módulo no dependa de
 * la base (los tests le pasan una falsa) y para que la reserva pública lo
 * llame dentro de su transacción.
 */
export type BaseDeOcupacion = Pick<Prisma.TransactionClient, "appointment" | "timeBlock">

/** Tope por consulta: un día de un profesional no tiene cientos de citas, y sin tope un rango amplio traía todo. */
const TOPE = 500

/** Lee las citas activas y los bloqueos que se pisan con [desde, hasta). */
export async function leerOcupacion(db: BaseDeOcupacion, consulta: ConsultaDeOcupacion): Promise<Ocupacion> {
  const where = wheresDeOcupacion(consulta)
  const [citas, bloqueos] = await Promise.all([
    where.citas
      ? db.appointment.findMany({
          where: where.citas,
          select: { id: true, memberId: true, status: true, startTime: true, endTime: true },
          orderBy: { startTime: "asc" },
          take: TOPE,
        })
      : Promise.resolve([]),
    db.timeBlock.findMany({
      where: where.bloqueos,
      select: { id: true, memberId: true, motivo: true, startTime: true, endTime: true },
      orderBy: { startTime: "asc" },
      take: TOPE,
    }),
  ])
  // Se vuelve a filtrar por estado en memoria: si un llamador arma la lista a
  // mano (o la base devuelve de más), una cita que libera nunca cuenta.
  return { citas: citas.filter((cita) => ocupaElHorario(cita.status)), bloqueos }
}

/** De lo leído, lo que se pisa con `tramo`. */
export function conflictosDelTramo(ocupacion: Ocupacion, tramo: Tramo): Ocupacion {
  return {
    citas: ocupacion.citas.filter((cita) => ocupaElHorario(cita.status) && sePisan(cita, tramo)),
    bloqueos: ocupacion.bloqueos.filter((bloqueo) => sePisan(bloqueo, tramo)),
  }
}

/** Si el tramo no se pisa con ninguna cita activa ni bloqueo. */
export function estaLibre(ocupacion: Ocupacion, tramo: Tramo): boolean {
  const conflictos = conflictosDelTramo(ocupacion, tramo)
  return conflictos.citas.length === 0 && conflictos.bloqueos.length === 0
}
