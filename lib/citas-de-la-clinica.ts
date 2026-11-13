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

/**
 * Lo que el panel recibe de una cita al leerla, crearla o editarla
 * (`/api/citas` y `/api/citas/[id]`), con `select` explícito: nunca el hash
 * del enlace del cliente (`manageTokenHash`), ni las comisiones congeladas
 * (`commission*`), ni la marca del recordatorio. Una columna nueva de la cita
 * no sale sola: hay que sumarla acá.
 */
const SELECCION_DE_CITA_DEL_PANEL = {
  id: true,
  businessId: true,
  title: true,
  startTime: true,
  endTime: true,
  status: true,
  notes: true,
  // Lo que el cliente escribió al reservar (#122).
  clientComments: true,
  price: true,
  serviceId: true,
  source: true,
  customerId: true,
  customer: { select: { id: true, name: true, lastName: true, email: true, phone: true } },
  memberId: true,
  member: { select: { id: true, role: true, user: { select: { id: true, name: true } } } },
  // "Por confirmar" (#84) y quién canceló y cuándo (#121).
  confirmacionPorFaltas: true,
  canceladaPor: true,
  canceladaEn: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AppointmentSelect

/** Lo mismo, con lo de la clínica dental: el sillón (con su nombre) y la primera vez. */
const SELECCION_DE_CITA_DE_LA_CLINICA = {
  ...SELECCION_DE_CITA_DEL_PANEL,
  sillonId: true,
  sillon: { select: { id: true, nombre: true } },
  primeraVez: true,
} satisfies Prisma.AppointmentSelect

/**
 * El `select` de la respuesta de una cita al panel. Fuera de una clínica
 * dental (`veSillones` en `lib/permisos.ts`) sin `primeraVez` ni el sillón:
 * en un salón no dicen nada y no son de su rubro.
 */
export function seleccionDeCitaDelPanel(
  conLaClinica: boolean
): typeof SELECCION_DE_CITA_DEL_PANEL | typeof SELECCION_DE_CITA_DE_LA_CLINICA {
  return conLaClinica ? SELECCION_DE_CITA_DE_LA_CLINICA : SELECCION_DE_CITA_DEL_PANEL
}
