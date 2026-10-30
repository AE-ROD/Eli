import type { Prisma } from "@prisma/client"
import { TOTAL_MAXIMO_CENTAVOS } from "@/lib/atenciones"
import { rangoDelDiaEn, fechaYMinutosEn } from "@/lib/zona-horaria"

/**
 * Cierre de caja (#71). Cada cierre cubre `(desde, hasta]`: `desde` es el
 * `hasta` del cierre anterior (o, para el primero, el inicio del día del
 * negocio) y `hasta` el momento en que se cierra. Así los cierres quedan uno
 * detrás del otro, sin hueco ni solape, y un pago justo en el límite cae en
 * uno solo: el que termina ahí (`atencionBloqueada` usa el mismo borde).
 *
 * - Esperado = fondo inicial + pagos en efectivo + propinas en efectivo del
 *   rango. Sólo atenciones cobradas y no anuladas (una anulada devolvió la
 *   plata). Los adelantos pagados desde caja no cuentan en esta versión.
 * - Diferencia = contado − esperado. Con diferencia, la nota es obligatoria.
 * - Los otros medios (tarjeta, transferencia…) van en `desglose`, sólo para
 *   leer: no están en el cajón.
 *
 * Todo en centavos enteros, como el resto del dinero.
 */

export const EFECTIVO = "efectivo"

export const MENSAJE_CAJA_CAMBIO =
  "Alguien cerró la caja recién: lo que contaste puede no cuadrar con lo nuevo. Revisa los montos y vuelve a cerrar"
export const MENSAJE_NOTA_OBLIGATORIA = "Hay diferencia entre lo esperado y lo contado: escribe una nota que la explique"

/** Lo que se suma de una atención cobrada en el rango. */
export interface MontoPorMedio {
  method: string
  amountCents: number
}

export interface DesgloseDeCaja {
  /** Pagos por medio que no es efectivo, en centavos. */
  otrosMedios: Record<string, number>
  /** Propinas por medio que no es efectivo, en centavos. */
  propinasOtrosMedios: Record<string, number>
}

export interface ResumenDeCaja {
  efectivoCobradoCents: number
  propinasEfectivoCents: number
  desglose: DesgloseDeCaja
}

export interface CuentaDeCaja extends ResumenDeCaja {
  fondoInicialCents: number
  efectivoEsperadoCents: number
  efectivoContadoCents: number
  diferenciaCents: number
}

function sumarPorMedio(montos: readonly MontoPorMedio[]): { efectivo: number; otros: Record<string, number> } {
  let efectivo = 0
  const otros: Record<string, number> = {}
  for (const { method, amountCents } of montos) {
    if (method === EFECTIVO) efectivo += amountCents
    else otros[method] = (otros[method] ?? 0) + amountCents
  }
  return { efectivo, otros }
}

/** Lo cobrado y las propinas del rango, separados en efectivo y el resto. Puro. */
export function resumirCaja(pagos: readonly MontoPorMedio[], propinas: readonly MontoPorMedio[]): ResumenDeCaja {
  const deLosPagos = sumarPorMedio(pagos)
  const deLasPropinas = sumarPorMedio(propinas)
  return {
    efectivoCobradoCents: deLosPagos.efectivo,
    propinasEfectivoCents: deLasPropinas.efectivo,
    desglose: { otrosMedios: deLosPagos.otros, propinasOtrosMedios: deLasPropinas.otros },
  }
}

/** La cuenta completa del cierre, con lo contado. Puro; las CHECK de la base repiten las dos igualdades. */
export function cuentaDeCaja(resumen: ResumenDeCaja, fondoInicialCents: number, contadoCents: number): CuentaDeCaja {
  const efectivoEsperadoCents = fondoInicialCents + resumen.efectivoCobradoCents + resumen.propinasEfectivoCents
  return {
    ...resumen,
    fondoInicialCents,
    efectivoEsperadoCents,
    efectivoContadoCents: contadoCents,
    diferenciaCents: contadoCents - efectivoEsperadoCents,
  }
}

/** Si los montos caben en las columnas `Int` (el mismo tope del resto del dinero). */
export function cabeEnLaCaja(cuenta: CuentaDeCaja): boolean {
  return (
    cuenta.efectivoEsperadoCents <= TOTAL_MAXIMO_CENTAVOS &&
    Math.abs(cuenta.diferenciaCents) <= TOTAL_MAXIMO_CENTAVOS
  )
}

/**
 * Desde cuándo cuenta el próximo cierre: el final del último, o si nunca se
 * cerró, el inicio del día del negocio en que cae `ahora`.
 */
export function inicioDelProximoCierre(ultimoHasta: Date | null, ahora: Date, zona: string): Date {
  if (ultimoHasta) return ultimoHasta
  return rangoDelDiaEn(fechaYMinutosEn(ahora, zona).fecha, zona).desde
}

/** El día del negocio de un instante, como `Date` a medianoche UTC (lo que guarda una columna `DATE`). */
export function diaDelNegocio(instante: Date, zona: string): Date {
  return new Date(`${fechaYMinutosEn(instante, zona).fecha}T00:00:00.000Z`)
}

/**
 * Las atenciones que entran en `(desde, hasta]`: cobradas (finalizadas) del
 * negocio, por la hora del cobro. Una anulada no entra.
 */
function atencionesDelRango(businessId: string, desde: Date, hasta: Date): Prisma.VisitWhereInput {
  return { businessId, status: "finalizada", paidAt: { gt: desde, lte: hasta } }
}

/**
 * Lee de la base los pagos y propinas del rango, siempre del negocio
 * `businessId` (el de la sesión). Recibe la base, o el `tx` de la
 * transacción que cierra.
 */
export async function leerCaja(
  db: Pick<Prisma.TransactionClient, "visitPayment" | "propinaDeAtencion">,
  businessId: string,
  desde: Date,
  hasta: Date
): Promise<ResumenDeCaja> {
  const atenciones = atencionesDelRango(businessId, desde, hasta)
  const [pagos, propinas] = await Promise.all([
    db.visitPayment.findMany({
      where: { visit: { is: atenciones } },
      select: { method: true, amountCents: true },
    }),
    db.propinaDeAtencion.findMany({
      where: { businessId, visit: { is: atenciones } },
      select: { method: true, amountCents: true },
    }),
  ])
  return resumirCaja(pagos, propinas)
}
