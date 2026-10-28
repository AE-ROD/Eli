import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { verificarLimite } from "@/lib/rate-limit"
import { registrarError } from "@/lib/registro-de-errores"
import { clienteNoEliminado } from "@/lib/clientes-eliminados"
import { escribirCsv } from "@/lib/csv"
import {
  ATENCIONES_MAXIMAS_POR_EXPORTACION,
  filasDeAtenciones,
  nombreDeArchivo,
  rangoDeExportacion,
  respuestaCsv,
} from "@/lib/exportar"
import { zonaDelNegocio } from "@/lib/zona-horaria"
import { actorDeSesion, puedeImportarExportarClientes, whereDeAtenciones } from "@/lib/permisos"

/**
 * Descarga en CSV las atenciones (visitas al local) que llegaron entre dos
 * días, los dos incluidos, en la hora del negocio: `?desde=2026-10-01&hasta=2026-10-31`.
 *
 * Trae lo cobrado, así que además de `puedeImportarExportarClientes` es
 * facturación del negocio: dueño y encargado, los mismos que ven los
 * ingresos. Las atenciones de un cliente eliminado no salen.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor || !puedeImportarExportarClientes(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { permitido } = await verificarLimite("exportacion", `negocio:${actor.businessId}`)
  if (!permitido) {
    return NextResponse.json({ error: "Ya se descargaron varias planillas en la última hora. Intenta más tarde." }, { status: 429 })
  }

  try {
    const negocio = await prisma.business.findUnique({ where: { id: actor.businessId }, select: { timezone: true } })
    const zona = zonaDelNegocio(negocio?.timezone)

    const { searchParams } = new URL(request.url)
    const desdeTexto = searchParams.get("desde")
    const hastaTexto = searchParams.get("hasta")
    const rango = rangoDeExportacion(desdeTexto, hastaTexto, zona)
    if (!rango.ok) return NextResponse.json({ error: rango.error }, { status: 400 })

    const atenciones = await prisma.visit.findMany({
      where: whereDeAtenciones(actor, {
        arrivedAt: { gte: rango.desde, lt: rango.hasta },
        OR: [{ customerId: null }, { customer: { is: clienteNoEliminado } }],
      }),
      select: {
        arrivedAt: true,
        paidAt: true,
        customerName: true,
        status: true,
        totalCents: true,
        services: { select: { serviceName: true, professionalName: true, priceCents: true } },
      },
      orderBy: { arrivedAt: "asc" },
      // Una de más para saber si el período se pasa del tope sin contarlas aparte.
      take: ATENCIONES_MAXIMAS_POR_EXPORTACION + 1,
    })
    if (atenciones.length > ATENCIONES_MAXIMAS_POR_EXPORTACION) {
      return NextResponse.json(
        { error: "El período tiene demasiadas atenciones para una sola planilla: pídelo por partes." },
        { status: 400 }
      )
    }

    return respuestaCsv(
      escribirCsv(filasDeAtenciones(atenciones, zona)),
      nombreDeArchivo("atenciones", `${desdeTexto}-al-${hastaTexto}`)
    )
  } catch (error) {
    registrarError("exportando atenciones", error)
    return NextResponse.json({ error: "No se pudo descargar la planilla" }, { status: 500 })
  }
}
