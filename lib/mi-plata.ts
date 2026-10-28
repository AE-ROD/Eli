import type { Prisma } from "@prisma/client"
import { SELECCION_DE_RESUMEN, formatearResumen, leerNegocioParaLiquidar, type ResumenDeLiquidacion } from "@/lib/liquidacion"
import type { TipoDeMovimiento } from "@/lib/movimientos"
import {
  fechaDeColumna,
  fechaDelNegocio,
  finDelPeriodoEn,
  inicioDelPeriodoEn,
  periodoParaLeer,
  periodoQueContiene,
  type TipoDePeriodo,
} from "@/lib/periodos-de-liquidacion"

/**
 * Mi plata (#70): lo que lleva ganado quien atiende, sólo lo suyo. Recibe el
 * `memberId` de la sesión (nunca uno que venga del pedido) y todo se acota a
 * ese miembro y a su negocio. No trae totales del negocio, pagos de
 * atenciones ni líneas de otros.
 *
 * "Ganado" es comisión ya congelada más propinas, de atenciones finalizadas,
 * por día de cobro en la zona del negocio: hoy, la semana (con el día de
 * inicio que eligió la dueña) y el período de liquidación que contiene hoy.
 * Lo que espera % no tiene monto: sólo se cuenta.
 */

type Db = Prisma.TransactionClient

export interface Ganado {
  comisionesCents: number
  propinasCents: number
  totalCents: number
}

export interface MiPlata {
  nombre: string
  hoy: Ganado & { fecha: string }
  semana: Ganado & { desde: string; hasta: string; texto: string }
  periodo: Ganado & { tipo: TipoDePeriodo; desde: string; hasta: string; texto: string }
  /** Servicios y productos cobrados que todavía no tienen % y no se liquidaron. */
  esperanPorcentaje: number
  adelantos: {
    totalCents: number
    lista: { id: string; tipo: TipoDeMovimiento; montoCents: number; fecha: string; motivo: string | null }[]
  }
  liquidaciones: ResumenDeLiquidacion[]
}

const LIQUIDACIONES_A_MOSTRAR = 24

function sumar(
  lineas: readonly { fecha: string; comisionCents: number }[],
  propinas: readonly { fecha: string; montoCents: number }[],
  desde: string,
  hasta: string
): Ganado {
  const dentro = (fecha: string) => fecha >= desde && fecha <= hasta
  const comisionesCents = lineas.filter((l) => dentro(l.fecha)).reduce((total, l) => total + l.comisionCents, 0)
  const propinasCents = propinas.filter((p) => dentro(p.fecha)).reduce((total, p) => total + p.montoCents, 0)
  return { comisionesCents, propinasCents, totalCents: comisionesCents + propinasCents }
}

/** `null` si el miembro no es del negocio (el endpoint responde 401). */
export async function calcularMiPlata(
  db: Db,
  opciones: { businessId: string; memberId: string; ahora: Date }
): Promise<MiPlata | null> {
  const { businessId, memberId, ahora } = opciones
  const miembro = await db.businessMember.findFirst({
    where: { id: memberId, businessId },
    select: { user: { select: { name: true } } },
  })
  if (!miembro) return null

  const { zona, config } = await leerNegocioParaLiquidar(db, businessId)
  const hoy = fechaDelNegocio(ahora, zona)
  const semana = periodoQueContiene(hoy, { periodo: "semanal", inicioSemana: config.inicioSemana })
  const periodo = periodoQueContiene(hoy, config)

  // Un solo rango que cubre la semana y el período (pueden no contenerse).
  const desde = semana.desde < periodo.desde ? semana.desde : periodo.desde
  const hasta = semana.hasta > periodo.hasta ? semana.hasta : periodo.hasta
  const cobradoEnRango = {
    status: "finalizada",
    businessId,
    paidAt: { gte: inicioDelPeriodoEn(desde, zona), lt: finDelPeriodoEn(hasta, zona) },
  }

  const [lineas, propinas, esperanPorcentaje, adelantos, liquidaciones] = await Promise.all([
    db.visitService.findMany({
      where: { memberId, byOwner: false, commissionAt: { not: null }, visit: { is: cobradoEnRango } },
      select: { commissionCents: true, visit: { select: { paidAt: true } } },
    }),
    db.propinaDeAtencion.findMany({
      where: { businessId, memberId, visit: { is: cobradoEnRango } },
      select: { amountCents: true, visit: { select: { paidAt: true } } },
    }),
    db.visitService.count({
      where: {
        memberId,
        byOwner: false,
        commissionAt: null,
        liquidacionId: null,
        visit: { is: { businessId, status: "finalizada" } },
      },
    }),
    db.movimientoDeLiquidacion.findMany({
      where: { businessId, memberId, tipo: { in: ["adelanto", "vale"] }, liquidacionId: null, anuladoAt: null },
      select: { id: true, tipo: true, montoCents: true, fecha: true, motivo: true },
      orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
    }),
    db.liquidacion.findMany({
      where: { businessId, memberId },
      select: SELECCION_DE_RESUMEN,
      orderBy: [{ desde: "desc" }, { cerradaAt: "desc" }],
      take: LIQUIDACIONES_A_MOSTRAR,
    }),
  ])

  const diaDe = (visita: { paidAt: Date | null } | null) => (visita?.paidAt ? fechaDelNegocio(visita.paidAt, zona) : "")
  const conFecha = lineas.map((l) => ({ fecha: diaDe(l.visit), comisionCents: l.commissionCents ?? 0 }))
  const propinasConFecha = propinas.map((p) => ({ fecha: diaDe(p.visit), montoCents: p.amountCents }))

  const lista = adelantos.map((m) => ({
    id: m.id,
    tipo: m.tipo as TipoDeMovimiento,
    montoCents: m.montoCents,
    fecha: fechaDeColumna(m.fecha),
    motivo: m.motivo,
  }))

  return {
    nombre: miembro.user.name,
    hoy: { fecha: hoy, ...sumar(conFecha, propinasConFecha, hoy, hoy) },
    semana: { ...semana, texto: periodoParaLeer(semana.desde, semana.hasta), ...sumar(conFecha, propinasConFecha, semana.desde, semana.hasta) },
    periodo: {
      tipo: config.periodo,
      ...periodo,
      texto: periodoParaLeer(periodo.desde, periodo.hasta),
      ...sumar(conFecha, propinasConFecha, periodo.desde, periodo.hasta),
    },
    esperanPorcentaje,
    adelantos: { totalCents: lista.reduce((total, m) => total + m.montoCents, 0), lista },
    liquidaciones: liquidaciones.map(formatearResumen),
  }
}
