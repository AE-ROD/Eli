/**
 * Reservas por confirmar (#84, etapa 4). Si el contacto de una reserva
 * pública tiene `Business.porConfirmarTrasFaltas` faltas o más, la reserva
 * nace con `Appointment.confirmacionPorFaltas` en true y el local la confirma
 * o la cancela (`puedeResolverPorConfirmar`).
 *
 * Toda reserva pública nace "pendiente", así que el status solo no distingue:
 * "por confirmar" es la marca más el status "pendiente". Al confirmarla pasa a
 * "confirmada" y la marca queda como registro de por qué se pidió.
 */

/** Rango de `Business.porConfirmarTrasFaltas`. El mismo que la CHECK de la migración. */
export const FALTAS_PARA_CONFIRMAR_MINIMO = 1
export const FALTAS_PARA_CONFIRMAR_MAXIMO = 20

/** Cuántos días hacia atrás cuentan las faltas. */
export const DIAS_EN_QUE_CUENTAN_LAS_FALTAS = 365

export interface CitaPorConfirmar {
  status: string
  confirmacionPorFaltas: boolean
}

/** Si la cita está esperando que el local la confirme. Puro. */
export function estaPorConfirmar(cita: CitaPorConfirmar): boolean {
  return cita.confirmacionPorFaltas && cita.status === "pendiente"
}

/**
 * Otro resolvió la reserva entre que se leyó y se guardó (o el pedido traía
 * más cambios que se perderían): no se pisa. Uno por acción, para que el
 * mensaje diga lo que la persona estaba haciendo.
 */
export const MENSAJE_CONFIRMACION_CAMBIO = "La reserva cambió mientras la confirmabas. Recarga y vuelve a intentarlo"
export const MENSAJE_CANCELACION_CAMBIO = "La reserva cambió mientras la cancelabas. Recarga y vuelve a intentarlo"

/** El mensaje del 409 de una por confirmar que cambió, según lo que se pedía. */
export function mensajeDeReservaQueCambio(estadoPedido: string | undefined): string {
  return estadoPedido === "cancelada" ? MENSAJE_CANCELACION_CAMBIO : MENSAJE_CONFIRMACION_CAMBIO
}
