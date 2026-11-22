import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { deCentavos, totalEnCentavos } from "@/lib/atenciones"
import { IDS_DE_MEDIOS_DE_PAGO } from "@/lib/medios-de-pago"
import {
  actorDeSesion,
  puedeVerAnuladas,
  puedeVerIngresosDelNegocio,
  whereDeAtenciones,
  type Actor,
} from "@/lib/permisos"
import {
  IDS_DE_TURNOS,
  cumpleFiltros,
  devolucionesQueRestan,
  esZonaHorariaValida,
  lineaCumpleFiltros,
  restarDevoluciones,
  resumirAtenciones,
  turnoDe,
  type AtencionParaReporte,
  type DevolucionParaReporte,
  type FiltrosDeLinea,
} from "@/lib/reportes"
import { formatearLinea, formatearPago, leerRango, seleccionParaReporte, totalVisible } from "@/lib/tablero"
import { MEDIO_PAQUETE } from "@/lib/paquetes"

/** Un año, con margen para uno bisiesto. Más que eso se pide por partes. */
const RANGO_MAXIMO_MS = 366 * 24 * 60 * 60 * 1000

/**
 * Cuántas atenciones se traen como máximo. Los filtros por turno, profesional,
 * servicio y medio se aplican en memoria, así que hace falta un techo; si el
 * período lo supera, la respuesta lo dice con `truncado` en vez de callarlo.
 */
const TOPE_DE_ATENCIONES = 5000

const FILAS_POR_PAGINA = 50

/**
 * Un id de miembro o de servicio es un cuid (25 caracteres); 64 sobra y corta
 * un parámetro absurdo antes de recorrer miles de líneas comparándolo.
 */
const LARGO_MAXIMO_DE_ID = 64

const filtrosSchema = z.object({
  zona: z.string().refine(esZonaHorariaValida),
  turno: z.enum(IDS_DE_TURNOS).optional(),
  /** Id de miembro o `duenio`. */
  profesional: z.string().min(1).max(LARGO_MAXIMO_DE_ID).optional(),
  servicio: z.string().min(1).max(LARGO_MAXIMO_DE_ID).optional(),
  medio: z.enum(IDS_DE_MEDIOS_DE_PAGO).optional(),
  /** `1`: en vez de lo cobrado, el historial de lo anulado en el período. */
  anuladas: z.literal("1").optional(),
  pagina: z.coerce.number().int().min(1).default(1),
})

/** Los parámetros con valor. Un filtro vacío (`turno=`) es un filtro que no se eligió. */
function parametrosConValor(searchParams: URLSearchParams): Record<string, string> {
  return Object.fromEntries([...searchParams.entries()].filter(([, valor]) => valor !== ""))
}

function paginar<T>(filas: readonly T[], pagina: number) {
  return {
    filas: filas.slice((pagina - 1) * FILAS_POR_PAGINA, pagina * FILAS_POR_PAGINA),
    total: filas.length,
    pagina,
    paginas: Math.ceil(filas.length / FILAS_POR_PAGINA),
  }
}

// ─── Lo cobrado ──────────────────────────────────────────────────────────────

type AtencionLeida = Awaited<ReturnType<typeof buscarCobradas>>[number]

/** Las atenciones cobradas en el período que ve el actor, de la más reciente a la más vieja. */
function buscarCobradas(actor: Actor, desde: Date, hasta: Date) {
  return prisma.visit.findMany({
    where: whereDeAtenciones(actor, { status: "finalizada", paidAt: { gte: desde, lt: hasta } }),
    select: seleccionParaReporte(actor),
    orderBy: { paidAt: "desc" },
    take: TOPE_DE_ATENCIONES + 1,
  })
}

/**
 * Las devoluciones de paquetes hechas en el período (por `devueltoAt`, con el
 * mismo borde `[desde, hasta)` que los cobros), siempre del negocio de la
 * sesión. Sólo para quien ve los ingresos del negocio: el profesional no sabe
 * de devoluciones, así que para él ni se consulta.
 */
async function buscarDevoluciones(actor: Actor, desde: Date, hasta: Date): Promise<DevolucionParaReporte[]> {
  if (!puedeVerIngresosDelNegocio(actor)) return []
  const devueltos = await prisma.paqueteDeCliente.findMany({
    where: { businessId: actor.businessId, devueltoAt: { gte: desde, lt: hasta } },
    select: { devueltoAt: true, devueltoCents: true, devueltoMedio: true, serviceId: true },
    orderBy: { devueltoAt: "desc" },
    take: TOPE_DE_ATENCIONES,
  })
  return devueltos.flatMap(({ devueltoAt, devueltoCents, devueltoMedio, serviceId }) =>
    devueltoAt && devueltoCents && devueltoMedio ? [{ devueltoAt, devueltoCents, devueltoMedio, serviceId }] : []
  )
}

/**
 * La atención como entra al resumen. Para el profesional, la base ya devolvió
 * sólo sus líneas y ningún pago (`seleccionParaReporte`), y su total es lo que
 * sumaron sus líneas: lo suyo, nunca el total del negocio.
 */
function paraReporte(verNegocio: boolean, atencion: AtencionLeida, paidAt: Date): AtencionParaReporte {
  // Una sesión pagada con paquete no es plata de ese día (el paquete entró
  // cuando se vendió): en los reportes vale 0 y dice "(con paquete)". Su
  // valor real sigue en la línea, que es la base de la comisión.
  const lineas = atencion.services.map((linea) =>
    linea.usoDePaquete ? { ...linea, priceCents: 0, serviceName: `${linea.serviceName} (con paquete)` } : linea
  )
  if (!verNegocio) {
    return { paidAt, totalCents: totalEnCentavos(lineas), lineas, pagos: [] }
  }
  const prepagoCents = atencion.payments
    .filter((pago) => pago.method === MEDIO_PAQUETE)
    .reduce((suma, pago) => suma + pago.amountCents, 0)
  return {
    paidAt,
    totalCents: (atencion.totalCents ?? totalEnCentavos(atencion.services)) - prepagoCents,
    lineas,
    pagos: atencion.payments.filter((pago) => pago.method !== MEDIO_PAQUETE),
  }
}

/**
 * Cada línea dice si cumple los filtros de línea (`coincide`), para que la
 * pantalla resalte las que suman en el resumen. Sin filtros de línea, todas.
 */
function lineasDeLaFila(atencion: AtencionLeida, filtros: FiltrosDeLinea) {
  return atencion.services.map((linea) => ({ ...formatearLinea(linea), coincide: lineaCumpleFiltros(linea, filtros) }))
}

// ─── Lo anulado ──────────────────────────────────────────────────────────────

/**
 * El historial de lo anulado en el período (PRODUCTO.md, sección 7: lo
 * anulado "queda en el historial como anulada"). Por fecha de anulación, de
 * la más reciente a la más vieja. Sólo el período: los filtros de turno,
 * profesional, servicio y medio son del reporte de lo cobrado.
 *
 * Estas atenciones no suman en el reporte de lo cobrado, que sólo lee las
 * finalizadas. El resumen dice cuántas son y cuánto de lo anulado había
 * llegado a cobrarse: lo que dejó de sumar.
 *
 * Quién anuló es el nombre que se copió al anular (`voidedByName`): sigue
 * ahí aunque esa persona ya no esté en el negocio.
 */
async function reporteDeAnuladas(actor: Actor, desde: Date, hasta: Date, pagina: number) {
  const leidas = await prisma.visit.findMany({
    where: whereDeAtenciones(actor, { status: "anulada", voidedAt: { gte: desde, lt: hasta } }),
    select: seleccionParaReporte(actor),
    orderBy: { voidedAt: "desc" },
    take: TOPE_DE_ATENCIONES + 1,
  })
  const truncado = leidas.length > TOPE_DE_ATENCIONES
  const anuladas = leidas.slice(0, TOPE_DE_ATENCIONES)

  // Lo cobrado se congeló en `totalCents` al cobrar: es lo que dejó de sumar.
  // Menos lo pagado con una sesión de paquete, como en `paraReporte`: esa
  // plata nunca entró ese día, así que al anular tampoco deja de sumar.
  const cobradas = anuladas.filter((atencion) => atencion.paidAt !== null)
  const montoAnuladoCentavos = cobradas.reduce(
    (suma, atencion) =>
      suma +
      (atencion.totalCents ?? totalEnCentavos(atencion.services)) -
      atencion.payments
        .filter((pago) => pago.method === MEDIO_PAQUETE)
        .reduce((prepago, pago) => prepago + pago.amountCents, 0),
    0
  )

  const { filas, ...paginado } = paginar(anuladas, pagina)
  return {
    resumen: { cantidad: anuladas.length, montoAnulado: deCentavos(montoAnuladoCentavos) },
    filas: filas.map((atencion) => ({
      id: atencion.id,
      anuladaEn: atencion.voidedAt,
      motivoDeAnulacion: atencion.voidReason,
      anuladaPor: atencion.voidedByName,
      estabaCobrada: atencion.paidAt !== null,
      cobradaEn: atencion.paidAt,
      cliente: { id: atencion.customerId, nombre: atencion.customerName },
      lineas: atencion.services.map(formatearLinea),
      total: totalVisible(atencion),
      pagos: atencion.payments.map(formatearPago),
    })),
    ...paginado,
    truncado,
  }
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const rango = leerRango(searchParams, RANGO_MAXIMO_MS, "366 días")
  if (!rango.ok) {
    return NextResponse.json({ error: rango.error }, { status: 400 })
  }

  const parametros = filtrosSchema.safeParse(parametrosConValor(searchParams))
  if (!parametros.success) {
    // La zona la manda el navegador, no la elige nadie: si falla, el mensaje
    // lo dice para quien lo esté depurando. El resto son filtros elegidos.
    const fallaLaZona = parametros.error.errors.some((error) => error.path[0] === "zona")
    return NextResponse.json(
      {
        error: fallaLaZona ? "Falta la zona horaria o no es una zona IANA válida, como America/Santiago." : "Filtros inválidos",
        detalles: parametros.error.errors,
      },
      { status: 400 }
    )
  }
  const { pagina, anuladas, ...filtros } = parametros.data

  if (anuladas) {
    if (!puedeVerAnuladas(actor)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }
    return NextResponse.json(await reporteDeAnuladas(actor, rango.desde, rango.hasta, pagina))
  }

  const verNegocio = puedeVerIngresosDelNegocio(actor)
  // El profesional no ve medios de pago: filtrar por uno le diría cómo pagó
  // cada cliente. El filtro se ignora para él.
  if (!verNegocio) filtros.medio = undefined

  const [cobradas, devoluciones] = await Promise.all([
    buscarCobradas(actor, rango.desde, rango.hasta),
    buscarDevoluciones(actor, rango.desde, rango.hasta),
  ])
  const truncado = cobradas.length > TOPE_DE_ATENCIONES

  const incluidas = cobradas
    .slice(0, TOPE_DE_ATENCIONES)
    .flatMap((atencion) => (atencion.paidAt ? [{ atencion, reporte: paraReporte(verNegocio, atencion, atencion.paidAt) }] : []))
    // El profesional ve una atención en la que no tiene líneas si nació de una
    // cita suya; en su reporte no suma nada, así que no entra.
    .filter(({ reporte }) => verNegocio || reporte.lineas.length > 0)
    .filter(({ reporte }) => cumpleFiltros(reporte, filtros))

  // Las devoluciones de paquetes restan de lo cobrado en el período y de su
  // medio, y viajan aparte (`resumen.devoluciones`) para que la pantalla diga
  // por qué bajó. Qué devoluciones entran con cada filtro lo decide
  // `devolucionesQueRestan` (con filtro de profesional, ninguna).
  const { porMedio, ...resumenSinMedios } = restarDevoluciones(
    resumirAtenciones(
      incluidas.map(({ reporte }) => reporte),
      filtros
    ),
    devolucionesQueRestan(devoluciones, filtros)
  )

  const { filas, ...paginado } = paginar(incluidas, pagina)

  return NextResponse.json({
    // Para que la pantalla sepa cómo titular las cifras: lo del negocio, o lo
    // que sumó el profesional que mira.
    alcance: verNegocio ? "negocio" : "propio",
    resumen: verNegocio ? { ...resumenSinMedios, porMedio } : resumenSinMedios,
    filas: filas.map(({ atencion, reporte }) => ({
      id: atencion.id,
      cobradaEn: reporte.paidAt,
      turno: turnoDe(reporte.paidAt, filtros.zona),
      cliente: { id: atencion.customerId, nombre: atencion.customerName },
      lineas: lineasDeLaFila(atencion, filtros),
      ...(verNegocio && { total: deCentavos(reporte.totalCents), pagos: atencion.payments.map(formatearPago) }),
    })),
    ...paginado,
    truncado,
  })
}
