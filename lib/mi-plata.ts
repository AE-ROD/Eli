import type { Prisma } from "@prisma/client"
import { SELECCION_DE_RESUMEN, formatearResumen, leerNegocioParaLiquidar, liberadoEl, type ResumenDeLiquidacion } from "@/lib/liquidacion"
import type { TipoDeMovimiento } from "@/lib/movimientos"
import {
  fechaDeColumna,
  fechaParaColumna,
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
 *
 * En una clínica dental, su parte de los abonos de prótesis de las que es
 * tratante (`odontologoCents`) cuenta como ganada el día en que se libera:
 * el más tardío entre el cobro y la entrega de la prótesis (`liberadoEl`,
 * igual que la liquidación). Lo ya cobrado de prótesis que todavía no se
 * entregan se muestra aparte, como "por liberar". Nunca lo de otra tratante.
 *
 * "Liquidar desde" (§3.7, decisión del 2026-11-10): lo cobrado antes de esa
 * fecha nunca se va a liquidar (se pagó por fuera de Eli). No espera %, y su
 * parte de los abonos de prótesis no cuenta ni como liberada ni por liberar:
 * el mismo corte que la liquidación. Las comisiones y propinas ganadas se
 * siguen mostrando por día de cobro (es lo que cobró).
 */

type Db = Prisma.TransactionClient

export interface Ganado {
  comisionesCents: number
  /** Su parte de los abonos de prótesis liberados (clínica dental); 0 en los demás rubros. */
  protesisCents: number
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
  /**
   * Clínica dental: su parte de los abonos ya cobrados de prótesis suyas que
   * todavía no se entregan. Se libera (y entra a la liquidación) al entregar.
   */
  protesisPorLiberar: { totalCents: number; abonos: number }
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
  abonos: readonly { fecha: string; comisionCents: number }[],
  desde: string,
  hasta: string
): Ganado {
  const dentro = (fecha: string) => fecha >= desde && fecha <= hasta
  const comisionesCents = lineas.filter((l) => dentro(l.fecha)).reduce((total, l) => total + l.comisionCents, 0)
  const protesisCents = abonos.filter((a) => dentro(a.fecha)).reduce((total, a) => total + a.comisionCents, 0)
  const propinasCents = propinas.filter((p) => dentro(p.fecha)).reduce((total, p) => total + p.montoCents, 0)
  return { comisionesCents, protesisCents, propinasCents, totalCents: comisionesCents + protesisCents + propinasCents }
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

  const { zona, config, liquidarDesde } = await leerNegocioParaLiquidar(db, businessId)
  const hoy = fechaDelNegocio(ahora, zona)
  const semana = periodoQueContiene(hoy, { periodo: "semanal", inicioSemana: config.inicioSemana })
  const periodo = periodoQueContiene(hoy, config)

  // Un solo rango que cubre la semana y el período (pueden no contenerse).
  const desde = semana.desde < periodo.desde ? semana.desde : periodo.desde
  const hasta = semana.hasta > periodo.hasta ? semana.hasta : periodo.hasta
  const finDelRango = finDelPeriodoEn(hasta, zona)
  // Lo cobrado antes de "Liquidar desde" no se liquida: ni espera %, ni sus abonos se liberan.
  const corte = liquidarDesde ? inicioDelPeriodoEn(liquidarDesde, zona) : null
  const inicioDelRango = inicioDelPeriodoEn(desde, zona)
  const cobradoEnRango = {
    status: "finalizada",
    businessId,
    paidAt: { gte: inicioDelRango, lt: finDelRango },
  }
  // Sus abonos de prótesis con la parte congelada, de prótesis suyas del negocio.
  const susAbonos = {
    memberId,
    byOwner: false,
    protesisId: { not: null },
    odontologoCents: { not: null },
  } satisfies Prisma.VisitServiceWhereInput
  const desdeLiquidarDesde = corte ? { paidAt: { gte: corte } } : {}

  const [lineas, abonos, porLiberar, propinas, esperanPorcentaje, adelantos, liquidaciones] = await Promise.all([
    db.visitService.findMany({
      where: { memberId, byOwner: false, commissionAt: { not: null }, protesisId: null, visit: { is: cobradoEnRango } },
      select: { commissionCents: true, visit: { select: { paidAt: true } } },
    }),
    // Liberados dentro del rango: cobrados y entregados antes de su fin, y
    // alguna de las dos cosas desde su inicio. Cobrados antes de "Liquidar
    // desde", nunca: aunque la entrega caiga en el rango, no se liquidan.
    db.visitService.findMany({
      where: {
        ...susAbonos,
        visit: { is: { status: "finalizada", businessId, paidAt: { lt: finDelRango, ...(corte ? { gte: corte } : {}) } } },
        protesis: { is: { businessId, memberId, entregadaEn: { not: null, lt: finDelRango } } },
        OR: [{ visit: { is: { paidAt: { gte: inicioDelRango } } } }, { protesis: { is: { entregadaEn: { gte: inicioDelRango } } } }],
      },
      select: { odontologoCents: true, visit: { select: { paidAt: true } }, protesis: { select: { entregadaEn: true } } },
    }),
    db.visitService.findMany({
      where: {
        ...susAbonos,
        liquidacionId: null,
        visit: { is: { status: "finalizada", businessId, ...desdeLiquidarDesde } },
        protesis: { is: { businessId, memberId, entregadaEn: null } },
      },
      select: { odontologoCents: true },
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
        // Los abonos de prótesis no esperan %: llevan el reparto de su prótesis.
        protesisId: null,
        // Lo cobrado antes de "Liquidar desde" no se va a liquidar: no espera nada.
        visit: {
          is: {
            businessId,
            status: "finalizada",
            ...desdeLiquidarDesde,
          },
        },
      },
    }),
    db.movimientoDeLiquidacion.findMany({
      where: {
        businessId,
        memberId,
        tipo: { in: ["adelanto", "vale"] },
        liquidacionId: null,
        anuladoAt: null,
        ...(liquidarDesde ? { fecha: { gte: fechaParaColumna(liquidarDesde) } } : {}),
      },
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
  const abonosConFecha = abonos.flatMap((a) =>
    a.visit?.paidAt && a.protesis?.entregadaEn
      ? [{ fecha: fechaDelNegocio(liberadoEl(a.visit.paidAt, a.protesis.entregadaEn), zona), comisionCents: a.odontologoCents ?? 0 }]
      : []
  )

  const lista = adelantos.map((m) => ({
    id: m.id,
    tipo: m.tipo as TipoDeMovimiento,
    montoCents: m.montoCents,
    fecha: fechaDeColumna(m.fecha),
    motivo: m.motivo,
  }))

  return {
    nombre: miembro.user.name,
    hoy: { fecha: hoy, ...sumar(conFecha, propinasConFecha, abonosConFecha, hoy, hoy) },
    semana: {
      ...semana,
      texto: periodoParaLeer(semana.desde, semana.hasta),
      ...sumar(conFecha, propinasConFecha, abonosConFecha, semana.desde, semana.hasta),
    },
    periodo: {
      tipo: config.periodo,
      ...periodo,
      texto: periodoParaLeer(periodo.desde, periodo.hasta),
      ...sumar(conFecha, propinasConFecha, abonosConFecha, periodo.desde, periodo.hasta),
    },
    esperanPorcentaje,
    protesisPorLiberar: {
      totalCents: porLiberar.reduce((total, a) => total + (a.odontologoCents ?? 0), 0),
      abonos: porLiberar.length,
    },
    adelantos: { totalCents: lista.reduce((total, m) => total + m.montoCents, 0), lista },
    liquidaciones: liquidaciones.map(formatearResumen),
  }
}
