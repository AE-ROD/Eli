import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion } from "@/lib/permisos"
import { leerLiquidacion, respuestaDeErrorDePlata } from "@/lib/liquidacion"

/**
 * Una liquidación con todo lo que incluye. La gestión ve cualquiera del
 * negocio; el profesional, sólo las suyas. Lo ajeno y lo que no existe: 404.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  try {
    const { id } = await params
    const detalle = await leerLiquidacion(prisma, actor, id)
    if (!detalle) return NextResponse.json({ error: "Liquidación no encontrada" }, { status: 404 })
    return NextResponse.json(detalle)
  } catch (error) {
    return respuestaDeErrorDePlata(error, "leyendo una liquidación")
  }
}
