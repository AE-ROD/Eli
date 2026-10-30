import type { Prisma } from "@prisma/client"
import { CODIGO_CORREGIR_CON_AJUSTE, atencionBloqueada, tomarCandadoDeCajaCompartido } from "@/lib/bloqueos-de-dinero"
import { tomarCandadosDeLaAtencion } from "@/lib/liquidacion"
import { ocupaElHorario } from "@/lib/ocupacion"

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
 *   atención viva en el Tablero (una anulada no cuenta). La de "no vino"
 *   había dejado libre su horario: al volver se avisa si choca, como la
 *   cancelada (#140). La completada nunca lo soltó: no avisa.
 * - Si esa atención ya entró en un cierre de caja o en una liquidación, la
 *   plata ya se rindió: 409 "corrígelo con un ajuste" (`atencionBloqueada`),
 *   con `codigo: CODIGO_CORREGIR_CON_AJUSTE` como la anulación (#134): la
 *   agenda decide con el código, no con el texto. Antes de mirarlo se toman
 *   los mismos candados que la anulación (#101).
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
  return { tipo: "reactivar", avisarChoques: !ocupaElHorario(desde), limpiarCancelacion: false }
}

/** Por qué no se reactiva por su atención: el mensaje y, si la plata ya se rindió, el código estable. */
export interface ProblemaConLaAtencion {
  mensaje: string
  codigo?: typeof CODIGO_CORREGIR_CON_AJUSTE
}

/**
 * Por qué la atención de la cita impide reactivarla, o `null` si no tiene
 * una viva. Va dentro de la transacción que reactiva, con el `businessId` de
 * la sesión: la atención de otro negocio no existe para éste. Si hay una
 * viva, toma los candados de liquidación y de caja antes de mirarla.
 */
export async function problemaConLaAtencion(
  tx: Prisma.TransactionClient,
  businessId: string,
  citaId: string
): Promise<ProblemaConLaAtencion | null> {
  const atencion = await tx.visit.findFirst({
    where: { appointmentId: citaId, businessId },
    select: { id: true, status: true },
  })
  if (!atencion || atencion.status === "anulada") return null

  // Los mismos candados que la anulación, en el mismo orden: primero los de
  // liquidación de quienes atendieron, después el de la caja compartido. Un
  // cierre (de liquidación o de caja) que esté incluyendo esta atención
  // termina antes, y entonces `atencionBloqueada` lo ve.
  await tomarCandadosDeLaAtencion(tx, businessId, atencion.id)
  await tomarCandadoDeCajaCompartido(tx, businessId)

  const bloqueo = await atencionBloqueada(tx, businessId, atencion.id)
  if (bloqueo?.motivo === "liquidacion") return { mensaje: MENSAJE_EN_LIQUIDACION, codigo: CODIGO_CORREGIR_CON_AJUSTE }
  if (bloqueo?.motivo === "caja") return { mensaje: MENSAJE_EN_CAJA, codigo: CODIGO_CORREGIR_CON_AJUSTE }
  return { mensaje: MENSAJE_CON_ATENCION }
}
