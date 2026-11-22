import type { Prisma } from "@prisma/client"
import { TOTAL_MAXIMO_CENTAVOS } from "@/lib/atenciones"
import { rangoDelDiaEn, fechaYMinutosEn } from "@/lib/zona-horaria"
import { MEDIO_PAQUETE } from "@/lib/paquetes"

/**
 * Cierre de caja (#71). Cada cierre cubre `(desde, hasta]`: `desde` es el
 * `hasta` del cierre anterior (o, para el primero, el inicio del día del
 * negocio) y `hasta` el momento hasta el que se vio la caja al contar (la
 * hora de la base en el GET): lo cobrado después queda para el próximo. Así los cierres quedan uno
 * detrás del otro, sin hueco ni solape, y un pago justo en el límite cae en
 * uno solo: el que termina ahí (`atencionBloqueada` usa el mismo borde).
 *
 * - Esperado = fondo inicial + pagos en efectivo + propinas en efectivo del
 *   rango − devoluciones de paquetes en efectivo. Sólo atenciones cobradas y
 *   no anuladas (una anulada devolvió la plata). Los adelantos pagados desde
 *   caja no cuentan en esta versión.
 * - Devoluciones de paquetes (`paquetes_de_clientes.devueltoAt`): plata que
 *   SALE. Entran por la hora en que se devolvió, con el mismo borde que los
 *   cobros (`(desde, hasta]`): una devolución posterior a un cierre cae en el
 *   siguiente, nunca cambia uno ya hecho. La de efectivo resta del esperado;
 *   las de otros medios se muestran junto a su medio. El esperado no baja de
 *   0: en un cajón no puede haber plata negativa.
 * - Diferencia = contado − esperado. Con diferencia, la nota es obligatoria.
 * - Los otros medios (tarjeta, transferencia…) van en `desglose`, sólo para
 *   leer: no están en el cajón.
 *
 * Todo en centavos enteros, como el resto del dinero.
 */

export const EFECTIVO = "efectivo"

export const MENSAJE_CAJA_CAMBIO =
  "Alguien cerró la caja recién: lo que contaste puede no cuadrar con lo nuevo. Revisa los montos y vuelve a cerrar"
export const MENSAJE_CAJA_CAMBIO_LO_COBRADO =
  "Lo cobrado cambió mientras contabas (un cobro o una anulación): revisa el esperado nuevo y vuelve a cerrar"
export const MENSAJE_NOTA_OBLIGATORIA = "Hay diferencia entre lo esperado y lo contado: escribe una nota que la explique"

/** Lo que se suma de una atención cobrada en el rango. */
export interface MontoPorMedio {
  method: string
  amountCents: number
}

/** Lo que de verdad hubo en el cajón antes de restar las devoluciones en efectivo (ver `columnasDelCierre`). */
export interface EfectivoAntesDeDevoluciones {
  fondoInicialCents: number
  efectivoCobradoCents: number
  propinasEfectivoCents: number
}

export interface DesgloseDeCaja {
  /** Pagos por medio que no es efectivo, en centavos. Lo cobrado, sin restar devoluciones. */
  otrosMedios: Record<string, number>
  /** Propinas por medio que no es efectivo, en centavos. */
  propinasOtrosMedios: Record<string, number>
  /**
   * Devoluciones de paquetes del rango por medio (también `efectivo`), en
   * centavos positivos. Ausente en los cierres anteriores a esta regla y en
   * los que no tuvieron ninguna.
   */
  devoluciones?: Record<string, number>
  /** Sólo en un cierre guardado con devoluciones en efectivo: las cifras reales, para mostrarlas. */
  efectivoAntesDeDevoluciones?: EfectivoAntesDeDevoluciones
}

export interface ResumenDeCaja {
  /** Lo cobrado en efectivo, sin restar devoluciones. */
  efectivoCobradoCents: number
  propinasEfectivoCents: number
  /** Lo devuelto en efectivo por paquetes en el rango, en centavos positivos. */
  devolucionesEfectivoCents: number
  desglose: DesgloseDeCaja
}

export interface CuentaDeCaja extends ResumenDeCaja {
  fondoInicialCents: number
  efectivoEsperadoCents: number
  efectivoContadoCents: number
  diferenciaCents: number
}

/** Todas las devoluciones de paquetes del rango, de cualquier medio, en centavos positivos. */
export function totalDevueltoCents(desglose: DesgloseDeCaja): number {
  return Object.values(desglose.devoluciones ?? {}).reduce((total, centavos) => total + centavos, 0)
}

/** El esperado: lo que entró en efectivo menos lo devuelto en efectivo, nunca menos de 0. */
export function efectivoEsperado(fondoCents: number, cobradoCents: number, propinasCents: number, devueltoCents: number): number {
  return Math.max(0, fondoCents + cobradoCents + propinasCents - devueltoCents)
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

/**
 * Lo cobrado, las propinas y las devoluciones de paquetes del rango,
 * separados en efectivo y el resto. Puro. Sin devoluciones, el desglose no
 * lleva la clave: queda igual que el de los cierres de antes.
 */
export function resumirCaja(
  pagos: readonly MontoPorMedio[],
  propinas: readonly MontoPorMedio[],
  devoluciones: readonly MontoPorMedio[] = []
): ResumenDeCaja {
  const deLosPagos = sumarPorMedio(pagos)
  const deLasPropinas = sumarPorMedio(propinas)
  const deLasDevoluciones = sumarPorMedio(devoluciones)
  return {
    efectivoCobradoCents: deLosPagos.efectivo,
    propinasEfectivoCents: deLasPropinas.efectivo,
    devolucionesEfectivoCents: deLasDevoluciones.efectivo,
    desglose: {
      otrosMedios: deLosPagos.otros,
      propinasOtrosMedios: deLasPropinas.otros,
      ...(devoluciones.length > 0 && {
        devoluciones: {
          ...(deLasDevoluciones.efectivo > 0 && { [EFECTIVO]: deLasDevoluciones.efectivo }),
          ...deLasDevoluciones.otros,
        },
      }),
    },
  }
}

/** La cuenta completa del cierre, con lo contado. Puro. */
export function cuentaDeCaja(resumen: ResumenDeCaja, fondoInicialCents: number, contadoCents: number): CuentaDeCaja {
  const efectivoEsperadoCents = efectivoEsperado(
    fondoInicialCents,
    resumen.efectivoCobradoCents,
    resumen.propinasEfectivoCents,
    resumen.devolucionesEfectivoCents
  )
  return {
    ...resumen,
    fondoInicialCents,
    efectivoEsperadoCents,
    efectivoContadoCents: contadoCents,
    diferenciaCents: contadoCents - efectivoEsperadoCents,
  }
}

/**
 * La cuenta como se guarda en `cierres_de_caja`. La tabla no tiene columna
 * para lo devuelto y sus CHECK exigen `esperado = fondo + cobrado + propinas`
 * con los tres en 0 o más. Sin migración, la devolución en efectivo se
 * descuenta de esas columnas (primero de lo cobrado, después de las propinas
 * y al final del fondo), de modo que el esperado guardado sea el real, y las
 * cifras de verdad quedan en `desglose.efectivoAntesDeDevoluciones` junto a
 * `desglose.devoluciones`: `efectivoDelCierre` las lee para mostrar. Sin
 * devoluciones en efectivo, las columnas son la cuenta tal cual.
 */
export function columnasDelCierre(cuenta: CuentaDeCaja) {
  let porRestar = cuenta.devolucionesEfectivoCents
  const restarDe = (centavos: number) => {
    const quita = Math.min(centavos, porRestar)
    porRestar -= quita
    return centavos - quita
  }
  const efectivoCobradoCents = restarDe(cuenta.efectivoCobradoCents)
  const propinasEfectivoCents = restarDe(cuenta.propinasEfectivoCents)
  const fondoInicialCents = restarDe(cuenta.fondoInicialCents)
  const desglose: DesgloseDeCaja =
    cuenta.devolucionesEfectivoCents > 0
      ? {
          ...cuenta.desglose,
          efectivoAntesDeDevoluciones: {
            fondoInicialCents: cuenta.fondoInicialCents,
            efectivoCobradoCents: cuenta.efectivoCobradoCents,
            propinasEfectivoCents: cuenta.propinasEfectivoCents,
          },
        }
      : cuenta.desglose
  return {
    fondoInicialCents,
    efectivoCobradoCents,
    propinasEfectivoCents,
    efectivoEsperadoCents: cuenta.efectivoEsperadoCents,
    efectivoContadoCents: cuenta.efectivoContadoCents,
    diferenciaCents: cuenta.diferenciaCents,
    desglose,
  }
}

const esCentavos = (valor: unknown): valor is number => typeof valor === "number" && Number.isInteger(valor) && valor >= 0

/**
 * Las cifras de efectivo de un cierre guardado, para mostrar: las reales si
 * hubo devoluciones en efectivo (`columnasDelCierre`), o las columnas. El
 * `desglose` es JSON: lo que no tenga la forma esperada se ignora.
 */
export function efectivoDelCierre(cierre: {
  fondoInicialCents: number
  efectivoCobradoCents: number
  propinasEfectivoCents: number
  desglose: unknown
}): EfectivoAntesDeDevoluciones & { devolucionesEfectivoCents: number } {
  const desglose = (typeof cierre.desglose === "object" && cierre.desglose !== null ? cierre.desglose : {}) as DesgloseDeCaja
  const antes = desglose.efectivoAntesDeDevoluciones
  const devuelto = desglose.devoluciones?.[EFECTIVO]
  const columnas = {
    fondoInicialCents: cierre.fondoInicialCents,
    efectivoCobradoCents: cierre.efectivoCobradoCents,
    propinasEfectivoCents: cierre.propinasEfectivoCents,
  }
  if (
    !esCentavos(devuelto) ||
    typeof antes !== "object" ||
    antes === null ||
    !esCentavos(antes.fondoInicialCents) ||
    !esCentavos(antes.efectivoCobradoCents) ||
    !esCentavos(antes.propinasEfectivoCents)
  ) {
    return { ...columnas, devolucionesEfectivoCents: 0 }
  }
  return {
    fondoInicialCents: antes.fondoInicialCents,
    efectivoCobradoCents: antes.efectivoCobradoCents,
    propinasEfectivoCents: antes.propinasEfectivoCents,
    devolucionesEfectivoCents: devuelto,
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
 * El cobro más antiguo de la caja abierta que es de un día anterior al de
 * `ahora` en la zona del negocio, o null si todo lo cobrado es de hoy (#120).
 * Sólo para avisar en pantalla que el cierre arrastra días sin cerrar: no
 * cambia el cálculo, que siempre cubre `(desde, ahora]` sin huecos. Mira
 * cobros y no sólo `desde`, para no avisar todos los días a quien cierra de
 * noche y abre al otro día sin vender en el medio. Siempre del negocio
 * `businessId` (el de la sesión).
 */
export async function primerCobroDeOtroDia(
  db: Pick<Prisma.TransactionClient, "visit">,
  businessId: string,
  desde: Date,
  ahora: Date,
  zona: string
): Promise<Date | null> {
  const inicioDeHoy = rangoDelDiaEn(fechaYMinutosEn(ahora, zona).fecha, zona).desde
  if (desde.getTime() >= inicioDeHoy.getTime()) return null
  const primero = await db.visit.findFirst({
    where: { businessId, status: "finalizada", paidAt: { gt: desde, lt: inicioDeHoy } },
    select: { paidAt: true },
    orderBy: { paidAt: "asc" },
  })
  return primero?.paidAt ?? null
}

/**
 * Lee de la base los pagos, las propinas y las devoluciones de paquetes del
 * rango, siempre del negocio `businessId` (el de la sesión). Recibe la base,
 * o el `tx` de la transacción que cierra.
 */
export async function leerCaja(
  db: Pick<Prisma.TransactionClient, "visitPayment" | "propinaDeAtencion" | "paqueteDeCliente">,
  businessId: string,
  desde: Date,
  hasta: Date
): Promise<ResumenDeCaja> {
  const atenciones = atencionesDelRango(businessId, desde, hasta)
  const [pagos, propinas, devueltos] = await Promise.all([
    db.visitPayment.findMany({
      // Lo pagado con una sesión de paquete no es plata que entró: el paquete
      // se cobró (y entró a la caja) el día en que se vendió.
      where: { visit: { is: atenciones }, method: { not: MEDIO_PAQUETE } },
      select: { method: true, amountCents: true },
    }),
    db.propinaDeAtencion.findMany({
      where: { businessId, visit: { is: atenciones } },
      select: { method: true, amountCents: true },
    }),
    // Lo devuelto de paquetes: por la hora de la devolución, con el mismo
    // borde `(desde, hasta]` que los cobros, y sólo de este negocio.
    db.paqueteDeCliente.findMany({
      where: { businessId, devueltoAt: { gt: desde, lte: hasta } },
      select: { devueltoMedio: true, devueltoCents: true },
    }),
  ])
  const devoluciones = devueltos.flatMap((paquete) =>
    paquete.devueltoMedio && paquete.devueltoCents ? [{ method: paquete.devueltoMedio, amountCents: paquete.devueltoCents }] : []
  )
  return resumirCaja(pagos, propinas, devoluciones)
}
