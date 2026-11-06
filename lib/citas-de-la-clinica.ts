import type { Prisma } from "@prisma/client"

/**
 * Lo que le pasa a lo clínico cuando una cita de la clínica dental se cancela
 * o se borra. Las prestaciones del plan y las evoluciones apuntan a la cita
 * con FK compuestas NO ACTION (migración `etapa_6_odontologia`): borrar la
 * cita con algo colgando da P2003, y cancelarla dejaría una prestación
 * "agendada" en una cita que ya no va a pasar.
 *
 * Reglas
 * ──────
 * - Cancelar (desde la agenda, al resolver una por confirmar o al anular la
 *   atención): las prestaciones **agendadas** en la cita vuelven a "por
 *   agendar", sin cita (el CHECK de la base exige las dos cosas juntas). Las
 *   realizadas no cambian: lo hecho, hecho está. Las evoluciones conservan la
 *   cita: cancelar se puede deshacer (reactivar) y la base sólo deja poner
 *   `appointmentId` en null, nunca volver a ponerlo, así que soltarla al
 *   cancelar perdería el dato para siempre.
 * - Borrar: lo mismo, y además se sueltan de la cita las prestaciones
 *   realizadas (conservan su estado y `realizadaEn`) y las evoluciones (el
 *   trigger `evoluciones_inmutables` permite justo eso). Sin esto, el borrado
 *   falla.
 * - Reactivar una cita cancelada no vuelve a agendar nada: las prestaciones
 *   quedaron por agendar y se agendan otra vez desde el plan.
 *
 * Va dentro de la misma transacción que cancela o borra la cita, y cada
 * escritura acotada al negocio: un id que no es del negocio no toca nada.
 */
export async function soltarLoClinicoDeLaCita(
  tx: Pick<Prisma.TransactionClient, "prestacionDelPlan" | "evolucion">,
  businessId: string,
  citaId: string,
  como: "cancela" | "borra"
): Promise<void> {
  await tx.prestacionDelPlan.updateMany({
    where: { businessId, appointmentId: citaId, estado: "agendada" },
    data: { estado: "por-agendar", appointmentId: null },
  })
  if (como === "cancela") return

  await tx.prestacionDelPlan.updateMany({
    where: { businessId, appointmentId: citaId },
    data: { appointmentId: null },
  })
  await tx.evolucion.updateMany({
    where: { businessId, appointmentId: citaId },
    data: { appointmentId: null },
  })
}

/** Las columnas que la clínica dental le sumó a la cita (migración `etapa_6_odontologia`). */
const COLUMNAS_DE_LA_CLINICA = ["primeraVez", "sillonId"] as const
type ColumnaDeLaClinica = (typeof COLUMNAS_DE_LA_CLINICA)[number]

/**
 * La cita sin las columnas de la clínica dental, para responderla fuera de una
 * clínica con la misma forma que antes de que existieran: en un salón
 * `primeraVez` siempre es `false` y `sillonId` siempre `null`, no dicen nada
 * y no son de su rubro. Lo mismo hace la lista (`GET /api/citas`), que ni las
 * pide fuera de una clínica.
 */
export function sinColumnasDeLaClinica<T extends Record<ColumnaDeLaClinica, unknown>>(cita: T): Omit<T, ColumnaDeLaClinica> {
  const copia: Record<string, unknown> = { ...cita }
  for (const columna of COLUMNAS_DE_LA_CLINICA) delete copia[columna]
  return copia as Omit<T, ColumnaDeLaClinica>
}
