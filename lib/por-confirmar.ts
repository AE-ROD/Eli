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
 * Lo que una pantalla sabe de la cita para decir "Por confirmar". Si el
 * cliente ya llegó (`conAtencion`: tiene una atención no anulada en el
 * Tablero), la reserva está resuelta aunque siga "pendiente". Puro.
 */
export interface CitaEnPantalla {
  status: string
  confirmacionPorFaltas?: boolean
  conAtencion?: boolean
}

/** "Por confirmar" en pantalla: por confirmar y el cliente todavía no llegó. */
export function sigueSinConfirmar(cita: CitaEnPantalla): boolean {
  return (
    cita.conAtencion !== true &&
    estaPorConfirmar({ status: cita.status, confirmacionPorFaltas: cita.confirmacionPorFaltas === true })
  )
}

/**
 * Lo que se le pide a la base de la atención de una cita: sólo su estado,
 * para calcular `conAtencion`. No sale en la respuesta (`conLlegada` lo quita).
 */
export const LLEGADA_DE_LA_CITA = { visit: { select: { status: true } } } as const

/** Cambia la atención de la cita por `conAtencion`: si llegó (atención no anulada). La atención no se expone. */
export function conLlegada<T extends { visit: { status: string } | null }>({
  visit,
  ...cita
}: T): Omit<T, "visit"> & { conAtencion: boolean } {
  return { ...cita, conAtencion: visit ? visit.status !== "anulada" : false }
}
