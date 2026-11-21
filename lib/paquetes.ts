/**
 * Paquetes de sesiones: "6 sesiones de Depilación láser por $150.000". Las
 * reglas, sin base de datos (lo que lee y escribe está en
 * `lib/paquetes-servidor.ts`). Decididas por el dueño del producto:
 *
 * - **Se vende al cobrar**, en el local, como una línea más de la atención:
 *   la plata entra a la caja ese día. No se vende en la reserva pública.
 * - **La comisión se gana al atender cada sesión**, no al vender: la línea de
 *   la venta queda con la comisión congelada en 0 %, y cada sesión usada es
 *   una línea normal con el valor de la sesión (`valorPorSesion`), que sigue
 *   la cascada de comisiones de quien atiende.
 * - **Una sesión usada queda pagada con el medio interno `paquete`**: no es
 *   plata que entra ese día, así que caja, reportes e inicio no la cuentan.
 * - **Vence sólo si la dueña le puso vigencia** al crear el paquete.
 * - **Devolver es de la dueña**: se devuelve lo no usado.
 * - No existen en la clínica dental, que tiene su plan de tratamiento.
 */

/** El medio con que queda pagada una sesión de paquete. No está en `MEDIOS_DE_PAGO`: no se elige en la caja. */
export const MEDIO_PAQUETE = "paquete"
export const NOMBRE_DEL_MEDIO_PAQUETE = "Paquete (ya pagado)"

export const SESIONES_MINIMAS = 2
export const SESIONES_MAXIMAS = 50
export const VIGENCIA_MAXIMA_EN_MESES = 36
/** Las vigencias que ofrece la pantalla; `null` es "no vence". */
export const VIGENCIAS_EN_MESES = [null, 3, 6, 12] as const
/** Cuántos paquetes distintos ofrece un negocio, como tope de las listas. */
export const MAXIMO_DE_PAQUETES = 100
/** Cuántos paquetes se venden o usan en un mismo cobro. */
export const MAXIMO_DE_PAQUETES_POR_COBRO = 10

/** Lo que vale cada sesión: el precio repartido, hacia abajo (centavos enteros). */
export function valorPorSesion(priceCents: number, sesiones: number): number {
  return Math.floor(priceCents / sesiones)
}

/** `Paquete de 6 sesiones: Depilación láser`: el nombre de la línea con que se vende. */
export function nombreDelPaquete(sesiones: number, servicio: string): string {
  return `Paquete de ${sesiones} sesiones: ${servicio}`
}

/** Cuánto se ahorra frente a pagar cada sesión suelta, en porcentaje entero; `null` si no hay ahorro o no hay precio. */
export function ahorroDelPaquete(priceCents: number, sesiones: number, precioSueltoCents: number | null): number | null {
  if (!precioSueltoCents || precioSueltoCents <= 0) return null
  const suelto = precioSueltoCents * sesiones
  if (priceCents >= suelto) return null
  return Math.round(((suelto - priceCents) / suelto) * 100)
}

/**
 * Hasta cuándo vale un paquete vendido en `vendidoAt`: el mismo día del mes,
 * `meses` después (un 31 que no existe en el mes de destino cae en su último
 * día). Sin vigencia, `null`: no vence.
 */
export function venceAtDe(vendidoAt: Date, meses: number | null): Date | null {
  if (!meses) return null
  const vence = new Date(vendidoAt)
  const dia = vence.getUTCDate()
  vence.setUTCDate(1)
  vence.setUTCMonth(vence.getUTCMonth() + meses)
  const ultimoDia = new Date(Date.UTC(vence.getUTCFullYear(), vence.getUTCMonth() + 1, 0)).getUTCDate()
  vence.setUTCDate(Math.min(dia, ultimoDia))
  return vence
}

export type EstadoDelPaquete = "activo" | "agotado" | "vencido" | "devuelto" | "anulado"

export interface PaqueteParaEstado {
  sesiones: number
  /** Sesiones usadas en atenciones no anuladas. */
  usadas: number
  venceAt: Date | null
  devueltoAt: Date | null
  /** La atención donde se vendió quedó anulada: el paquete no vale. */
  ventaAnulada: boolean
}

export function restantesDe(paquete: Pick<PaqueteParaEstado, "sesiones" | "usadas">): number {
  return Math.max(0, paquete.sesiones - paquete.usadas)
}

/** En qué está el paquete. El orden importa: lo que lo invalida entero va primero. */
export function estadoDelPaquete(paquete: PaqueteParaEstado, ahora: Date): EstadoDelPaquete {
  if (paquete.ventaAnulada) return "anulado"
  if (paquete.devueltoAt) return "devuelto"
  if (restantesDe(paquete) === 0) return "agotado"
  if (paquete.venceAt && paquete.venceAt.getTime() <= ahora.getTime()) return "vencido"
  return "activo"
}

/**
 * Lo que se devuelve: sin ninguna sesión usada, todo lo pagado; con alguna,
 * las que quedan por lo que vale cada una (nunca más de lo pagado).
 */
export function montoADevolver(paquete: { sesiones: number; usadas: number; priceCents: number; valorPorSesionCents: number }): number {
  if (paquete.usadas <= 0) return paquete.priceCents
  return Math.min(paquete.priceCents, restantesDe(paquete) * paquete.valorPorSesionCents)
}

/** `Le quedan 4 de 6`, `Le queda 1 de 6`, `Usó las 6`. */
export function textoDelSaldo(sesiones: number, usadas: number): string {
  const quedan = restantesDe({ sesiones, usadas })
  if (quedan === 0) return `Usó las ${sesiones}`
  return quedan === 1 ? `Le queda 1 de ${sesiones}` : `Le quedan ${quedan} de ${sesiones}`
}

export const TEXTO_DEL_ESTADO: Record<EstadoDelPaquete, string> = {
  activo: "Vigente",
  agotado: "Terminado",
  vencido: "Vencido",
  devuelto: "Devuelto",
  anulado: "Anulado",
}
