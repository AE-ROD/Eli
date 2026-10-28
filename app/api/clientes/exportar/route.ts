import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { verificarLimite } from "@/lib/rate-limit"
import { registrarError } from "@/lib/registro-de-errores"
import { clienteNoEliminado } from "@/lib/clientes-eliminados"
import { escribirCsv } from "@/lib/csv"
import { filasDeClientes, nombreDeArchivo, respuestaCsv } from "@/lib/exportar"
import { zonaDelNegocio, fechaYMinutosEn } from "@/lib/zona-horaria"
import { actorDeSesion, puedeImportarExportarClientes, whereDeClientes } from "@/lib/permisos"

/**
 * Descarga los clientes del negocio en CSV (`lib/exportar.ts`). Los
 * eliminados no salen: ya no tienen datos, y su fila sólo existe para que sus
 * citas y cobros sigan atados a algo.
 */
export async function GET() {
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
    const [negocio, clientes] = await Promise.all([
      prisma.business.findUnique({ where: { id: actor.businessId }, select: { timezone: true } }),
      prisma.customer.findMany({
        where: whereDeClientes(actor, clienteNoEliminado),
        select: {
          name: true,
          lastName: true,
          cedula: true,
          phone: true,
          email: true,
          tags: true,
          notes: true,
          whatsappConsentAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      }),
    ])
    const zona = zonaDelNegocio(negocio?.timezone)
    const hoy = fechaYMinutosEn(new Date(), zona).fecha
    return respuestaCsv(escribirCsv(filasDeClientes(clientes, zona)), nombreDeArchivo("clientes", hoy))
  } catch (error) {
    registrarError("exportando clientes", error)
    return NextResponse.json({ error: "No se pudo descargar la planilla" }, { status: 500 })
  }
}
