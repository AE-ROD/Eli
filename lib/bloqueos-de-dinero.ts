import type { Prisma } from "@prisma/client"

/**
 * Candados del dinero ya rendido. Una atención cuyo cobro entró en un cierre
 * de caja, o cuyas líneas o propinas entraron en una liquidación no anulada,
 * ya no se toca: ni se anula, ni se reactiva su cita, ni se le cambian
 * líneas. Lo que haya que corregir se corrige con un ajuste (409 "corrígelo
 * con un ajuste" en el endpoint).
 *
 * Lo usan la anulación de atenciones (frente A) y la reactivación de citas
 * (frente C), dentro de la misma transacción que escribe.
 */

export type MotivoDeBloqueo = "liquidacion" | "caja" | "laboratorio"

/**
 * El `codigo` de la respuesta 409 "corrígelo con un ajuste". Sale en dos
 * casos: al anular una atención ya rendida (#117) y al reactivar desde
 * PUT /api/citas/[id] una cita cuya atención ya entró en un cierre de caja o
 * en una liquidación (#134). La interfaz decide con esto, no con el texto del
 * mensaje, que puede cambiar.
 */
export const CODIGO_CORREGIR_CON_AJUSTE = "corregir-con-ajuste"

/**
 * El `codigo` del 409 al anular una atención con un abono de prótesis ya
 * pagado al laboratorio (clínica dental). Tampoco se anula, pero no se
 * corrige con un ajuste: primero se anula ese pago. La interfaz lo trata como
 * el de arriba (no recarga, no pierde el motivo escrito, deja de ofrecer
 * anular) con el mensaje del servidor, que dice qué hacer.
 */
export const CODIGO_PAGADO_AL_LABORATORIO = "pagado-al-laboratorio"

/**
 * Candado de la caja del negocio. El cierre lo toma exclusivo; cobrar y anular
 * lo toman compartido (entre ellos no se esperan) ANTES de fijar `paidAt` o de
 * mirar si la atención ya entró en un cierre. Así un cobro no queda con una
 * hora que cae dentro de un cierre que no lo contó, ni una anulación pasa en
 * medio de un cierre que la está sumando. La clave es la misma en los dos:
 * `hashtext('caja:' || businessId)`.
 */
export async function tomarCandadoDeCaja(tx: Prisma.TransactionClient, businessId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`caja:${businessId}`}))`
}

/** El mismo candado que `tomarCandadoDeCaja`, compartido: para cobrar y anular. */
export async function tomarCandadoDeCajaCompartido(tx: Prisma.TransactionClient, businessId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtext(${`caja:${businessId}`}))`
}

/**
 * La hora de la base en este instante, para fijar `paidAt` y el `hasta` de
 * un cierre DESPUÉS de tomar el candado de la caja. No `new Date()`: con dos
 * instancias de relojes desfasados, un cobro podía quedar con una hora
 * dentro de un cierre que no lo contó. `clock_timestamp()` y no `now()`:
 * `now()` es el inicio de la transacción, antes de esperar el candado.
 */
export async function horaDeLaBase(tx: Prisma.TransactionClient): Promise<Date> {
  const [fila] = await tx.$queryRaw<{ ahora: Date }[]>`SELECT clock_timestamp() AS ahora`
  if (!(fila?.ahora instanceof Date)) throw new Error("La base no devolvió la hora")
  return fila.ahora
}

export interface AtencionBloqueada {
  motivo: MotivoDeBloqueo
}

/**
 * `null` si la atención se puede tocar; si no, por qué no. La liquidación se
 * mira primero: es lo que ya se le pagó (o se le va a pagar) a alguien.
 *
 * - Liquidación: alguna línea o propina de la atención tiene `liquidacionId`
 *   de una liquidación no anulada. Una anulada libera sus ítems, así que no
 *   bloquea aunque alguno siguiera apuntándole.
 * - Caja: la atención tiene `paidAt` dentro de un cierre del negocio, en
 *   `(desde, hasta]` (un pago justo en el límite es del cierre que termina ahí).
 * - Laboratorio (clínica dental): algún abono de prótesis de la atención ya
 *   se le pagó al laboratorio en un pago no anulado. Lo rendido no se anula:
 *   primero se anula ese pago (que suelta sus líneas).
 *
 * Siempre acota por `businessId`: una atención de otro negocio no existe para
 * este y devuelve `null` (el endpoint ya respondió 404 antes de preguntar).
 */
export async function atencionBloqueada(
  db: Prisma.TransactionClient,
  businessId: string,
  visitId: string
): Promise<AtencionBloqueada | null> {
  const viva = { businessId, estado: { not: "anulada" } }

  const [lineaLiquidada, propinaLiquidada] = await Promise.all([
    db.visitService.findFirst({
      where: { visitId, visit: { is: { businessId } }, liquidacion: { is: viva } },
      select: { id: true },
    }),
    db.propinaDeAtencion.findFirst({
      where: { visitId, businessId, liquidacion: { is: viva } },
      select: { id: true },
    }),
  ])
  if (lineaLiquidada || propinaLiquidada) return { motivo: "liquidacion" }

  const pagadaAlLaboratorio = await db.visitService.findFirst({
    where: { visitId, visit: { is: { businessId } }, pagoAlLaboratorio: { is: { businessId, anuladoEn: null } } },
    select: { id: true },
  })
  if (pagadaAlLaboratorio) return { motivo: "laboratorio" }

  const atencion = await db.visit.findFirst({ where: { id: visitId, businessId }, select: { paidAt: true } })
  if (!atencion?.paidAt) return null

  const cierre = await db.cierreDeCaja.findFirst({
    where: { businessId, desde: { lt: atencion.paidAt }, hasta: { gte: atencion.paidAt } },
    select: { id: true },
  })
  return cierre ? { motivo: "caja" } : null
}
