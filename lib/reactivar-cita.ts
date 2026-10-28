import type { Prisma } from "@prisma/client"
import { atencionBloqueada } from "@/lib/bloqueos-de-dinero"

/**
 * Reactivar una cita: sacarla de un estado cerrado (cancelada, completada o
 * "no vino") por un error al marcarla. Lo deciden dueña y encargado
 * (`puedeReactivarCita`); el profesional no saca una cita de esos estados.
 *
 * - Cancelada → pendiente o confirmada, sólo si todavía no empezó. Al volver
 *   ocupa otra vez su horario, así que se avisa si choca (el endpoint usa
 *   `advertenciasDeAgenda` y `confirmarAdvertencias`, como al mover). Se
 *   borra quién y cuándo la canceló.
 * - Completada o "no vino" → confirmada, sólo si la cita no tiene una
 *   atención viva en el Tablero (una anulada no cuenta).
 * - Si esa atención ya entró en un cierre de caja o en una liquidación, la
 *   plata ya se rindió: 409 "corrígelo con un ajuste" (`atencionBloqueada`).
 *
 * Mover una cita cerrada sigue sin poderse (`sePuedeMover`): primero se
 * reactiva, después se mueve.
 */

export const ESTADOS_CERRADOS = ["cancelada", "completada", "no-asistio"] as const

export function esEstadoCerrado(estado: string): boolean {
  return (ESTADOS_CERRADOS as readonly string[]).includes(estado)
}

export const MENSAJE_SIN_PERMISO = "Sólo la dueña o el encargado pueden reactivar una cita cancelada, completada o de alguien que no vino"
export const MENSAJE_CANCELADA_A_OTRO = "Una cita cancelada sólo se reactiva como pendiente o confirmada"
export const MENSAJE_CANCELADA_PASADA = "La cita ya pasó: no se reactiva. Si el cliente quiere otra hora, agenda una cita nueva"
export const MENSAJE_CERRADA_A_OTRO = "Una cita completada o de alguien que no vino sólo vuelve a confirmada"
export const MENSAJE_CON_ATENCION =
  "Esta cita tiene una atención en el Tablero: no se devuelve a confirmada. Si fue un error, anula la atención primero"
export const MENSAJE_EN_CAJA = "La atención de esta cita ya entró en un cierre de caja: no se puede reactivar. Corrígelo con un ajuste"
export const MENSAJE_EN_LIQUIDACION =
  "La atención de esta cita ya entró en una liquidación: no se puede reactivar. Corrígelo con un ajuste"
/** Otro cambió la cita entre que se leyó y se reactivó: no se pisa su cambio. */
export const MENSAJE_CITA_CAMBIO = "La cita cambió mientras la reactivabas. Recarga y vuelve a intentarlo"

export type DecisionDeReactivacion =
  /** El cambio no saca la cita de un estado cerrado: no es una reactivación. */
  | { tipo: "no-aplica" }
  | { tipo: "rechazada"; status: 401 | 409; mensaje: string }
  | {
      tipo: "reactivar"
      /** Vuelve a ocupar un horario que estaba libre: se avisa si choca. */
      avisarChoques: boolean
      /** Se borran `canceladaPor` y `canceladaEn`. */
      limpiarCancelacion: boolean
    }

export interface PedidoDeReactivacion {
  /** El estado guardado. */
  desde: string
  /** El pedido; `undefined` si no se pidió cambiar el estado. */
  hacia: string | undefined
  /** Cuándo empieza la cita. */
  inicio: Date
  ahora: Date
  /** `puedeReactivarCita(actor)`. */
  puede: boolean
}

/** Si el cambio de estado pedido es una reactivación y si se permite. Puro. */
export function decidirReactivacion({ desde, hacia, inicio, ahora, puede }: PedidoDeReactivacion): DecisionDeReactivacion {
  if (hacia === undefined || hacia === desde || !esEstadoCerrado(desde)) return { tipo: "no-aplica" }
  if (!puede) return { tipo: "rechazada", status: 401, mensaje: MENSAJE_SIN_PERMISO }

  if (desde === "cancelada") {
    if (hacia !== "pendiente" && hacia !== "confirmada") {
      return { tipo: "rechazada", status: 409, mensaje: MENSAJE_CANCELADA_A_OTRO }
    }
    if (inicio.getTime() <= ahora.getTime()) return { tipo: "rechazada", status: 409, mensaje: MENSAJE_CANCELADA_PASADA }
    return { tipo: "reactivar", avisarChoques: true, limpiarCancelacion: true }
  }

  if (hacia !== "confirmada") return { tipo: "rechazada", status: 409, mensaje: MENSAJE_CERRADA_A_OTRO }
  return { tipo: "reactivar", avisarChoques: false, limpiarCancelacion: false }
}

/**
 * Por qué la atención de la cita impide reactivarla, o `null` si no tiene
 * una viva. Va dentro de la transacción que reactiva, con el `businessId` de
 * la sesión: la atención de otro negocio no existe para éste.
 */
export async function problemaConLaAtencion(
  tx: Prisma.TransactionClient,
  businessId: string,
  citaId: string
): Promise<string | null> {
  const atencion = await tx.visit.findFirst({
    where: { appointmentId: citaId, businessId },
    select: { id: true, status: true },
  })
  if (!atencion || atencion.status === "anulada") return null

  const bloqueo = await atencionBloqueada(tx, businessId, atencion.id)
  if (bloqueo?.motivo === "liquidacion") return MENSAJE_EN_LIQUIDACION
  if (bloqueo?.motivo === "caja") return MENSAJE_EN_CAJA
  return MENSAJE_CON_ATENCION
}
