import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { verificarLimite } from "@/lib/rate-limit"
import { escribirCsv } from "@/lib/csv"
import { nombreDeArchivo, respuestaCsv } from "@/lib/exportar"
import { actorDeSesion } from "@/lib/permisos"
import { filasDelComprobante, leerLiquidacion, respuestaDeErrorDePlata } from "@/lib/liquidacion"

/**
 * El comprobante de una liquidación en CSV. Lo descarga quien la ve: la
 * gestión, cualquiera del negocio; el profesional, las suyas (ajena: 404).
 * Cuenta en el límite de exportaciones, por usuario: así un profesional que
 * baja sus comprobantes no le gasta el cupo a la dueña. Cada celda pasa por
 * `escribirCsv`, que neutraliza las fórmulas.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const clave = session?.user?.id ? `usuario:${session.user.id}` : `negocio:${actor.businessId}`
  const { permitido } = await verificarLimite("exportacion", clave)
  if (!permitido) {
    return NextResponse.json({ error: "Ya se descargaron varias planillas en la última hora. Intenta más tarde." }, { status: 429 })
  }

  try {
    const { id } = await params
    const detalle = await leerLiquidacion(prisma, actor, id)
    if (!detalle) return NextResponse.json({ error: "Liquidación no encontrada" }, { status: 404 })

    const quien = detalle.miembro.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    return respuestaCsv(
      escribirCsv(filasDelComprobante(detalle)),
      nombreDeArchivo(`liquidacion-${quien}`, `${detalle.desde}-al-${detalle.hasta}`)
    )
  } catch (error) {
    return respuestaDeErrorDePlata(error, "descargando el comprobante de una liquidación")
  }
}
