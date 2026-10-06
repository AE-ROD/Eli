import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { deCentavos, totalEnCentavos } from "@/lib/atenciones"
import { IDS_DE_MEDIOS_DE_PAGO } from "@/lib/medios-de-pago"
import { actorDeSesion, puedeVerIngresosDelNegocio, whereDeAtenciones, type Actor } from "@/lib/permisos"
import {
  IDS_DE_TURNOS,
  cumpleFiltros,
  esZonaHorariaValida,
  resumirAtenciones,
  turnoDe,
  type AtencionParaReporte,
} from "@/lib/reportes"
import { formatearLinea, formatearPago, leerRango, seleccionDeAtencion } from "@/lib/tablero"

/** Un año, con margen para uno bisiesto. Más que eso se pide por partes. */
const RANGO_MAXIMO_MS = 366 * 24 * 60 * 60 * 1000

/**
 * Cuántas atenciones se traen como máximo. Los filtros por turno, profesional,
 * servicio y medio se aplican en memoria, así que hace falta un techo; si el
 * período lo supera, la respuesta lo dice con `truncado` en vez de callarlo.
 */
const TOPE_DE_ATENCIONES = 5000

const FILAS_POR_PAGINA = 50

const filtrosSchema = z.object({
  zona: z.string().refine(esZonaHorariaValida),
  turno: z.enum(IDS_DE_TURNOS).optional(),
  /** Id de miembro o `duenio`. */
  profesional: z.string().min(1).optional(),
  servicio: z.string().min(1).optional(),
  medio: z.enum(IDS_DE_MEDIOS_DE_PAGO).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
})

/** Los parámetros con valor. Un filtro vacío (`turno=`) es un filtro que no se eligió. */
function parametrosConValor(searchParams: URLSearchParams): Record<string, string> {
  return Object.fromEntries([...searchParams.entries()].filter(([, valor]) => valor !== ""))
}

type AtencionLeida = Awaited<ReturnType<typeof buscarCobradas>>[number]

/** Las atenciones cobradas en el período que ve el actor, de la más reciente a la más vieja. */
function buscarCobradas(actor: Actor, desde: Date, hasta: Date) {
  return prisma.visit.findMany({
    where: whereDeAtenciones(actor, { status: "finalizada", paidAt: { gte: desde, lt: hasta } }),
    select: seleccionDeAtencion(actor),
    orderBy: { paidAt: "desc" },
    take: TOPE_DE_ATENCIONES + 1,
  })
}

/**
 * La atención como entra al resumen. Para el profesional, la base ya devolvió
 * sólo sus líneas y ningún pago (`seleccionDeAtencion`), y su total es lo que
 * sumaron sus líneas: lo suyo, nunca el total del negocio.
 */
function paraReporte(verNegocio: boolean, atencion: AtencionLeida, paidAt: Date): AtencionParaReporte {
  if (!verNegocio) {
    return {
      paidAt,
      total: deCentavos(totalEnCentavos(atencion.services)),
      lineas: atencion.services,
      pagos: [],
    }
  }
  return {
    paidAt,
    total: atencion.total ?? deCentavos(totalEnCentavos(atencion.services)),
    lineas: atencion.services,
    pagos: atencion.payments,
  }
}

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
  const { pagina, ...filtros } = parametros.data

  const verNegocio = puedeVerIngresosDelNegocio(actor)
  // El profesional no ve medios de pago: filtrar por uno le diría cómo pagó
  // cada cliente. El filtro se ignora para él.
  if (!verNegocio) filtros.medio = undefined

  const cobradas = await buscarCobradas(actor, rango.desde, rango.hasta)
  const truncado = cobradas.length > TOPE_DE_ATENCIONES

  const incluidas = cobradas
    .slice(0, TOPE_DE_ATENCIONES)
    .flatMap((atencion) => (atencion.paidAt ? [{ atencion, reporte: paraReporte(verNegocio, atencion, atencion.paidAt) }] : []))
    // El profesional ve una atención en la que no tiene líneas si nació de una
    // cita suya; en su reporte no suma nada, así que no entra.
    .filter(({ reporte }) => verNegocio || reporte.lineas.length > 0)
    .filter(({ reporte }) => cumpleFiltros(reporte, filtros))

  const { porMedio, ...resumenSinMedios } = resumirAtenciones(incluidas.map(({ reporte }) => reporte))
  const total = incluidas.length

  const filas = incluidas
    .slice((pagina - 1) * FILAS_POR_PAGINA, pagina * FILAS_POR_PAGINA)
    .map(({ atencion, reporte }) => ({
      id: atencion.id,
      cobradaEn: reporte.paidAt,
      turno: turnoDe(reporte.paidAt, filtros.zona),
      cliente: { id: atencion.customerId, nombre: atencion.customerName },
      lineas: atencion.services.map(formatearLinea),
      ...(verNegocio && { total: reporte.total, pagos: atencion.payments.map(formatearPago) }),
    }))

  return NextResponse.json({
    // Para que la pantalla sepa cómo titular las cifras: lo del negocio, o lo
    // que sumó el profesional que mira.
    alcance: verNegocio ? "negocio" : "propio",
    resumen: verNegocio ? { ...resumenSinMedios, porMedio } : resumenSinMedios,
    filas,
    total,
    pagina,
    paginas: Math.ceil(total / FILAS_POR_PAGINA),
    truncado,
  })
}
