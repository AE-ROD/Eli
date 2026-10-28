import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cuerpoDelPedido } from "@/lib/cuerpo-del-pedido"
import { IDS_DE_MEDIOS_DE_PAGO } from "@/lib/medios-de-pago"
import { actorDeSesion, puedePagarLiquidacion, whereDeLiquidaciones } from "@/lib/permisos"
import { leerLiquidacion, pagarLiquidacion, quienFirma, respuestaDeErrorDePlata } from "@/lib/liquidacion"

const pagoSchema = z.object({
  medio: z.enum(IDS_DE_MEDIOS_DE_PAGO, { errorMap: () => ({ message: "Elige con qué se pagó." }) }),
})

/**
 * Marca pagada una liquidación cerrada: con qué medio, quién (id y nombre) y
 * cuándo. Sólo la dueña. Ajena: 404; ya pagada o anulada: 409.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  try {
    const { id } = await params
    const existe = await prisma.liquidacion.findFirst({ where: whereDeLiquidaciones(actor, { id }), select: { id: true } })
    if (!existe) return NextResponse.json({ error: "Liquidación no encontrada" }, { status: 404 })
    if (!puedePagarLiquidacion(actor)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { medio } = pagoSchema.parse(await cuerpoDelPedido(request))
    const firma = await quienFirma(prisma, actor, session?.user?.id)
    if (!firma) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    await prisma.$transaction((tx) =>
      pagarLiquidacion(tx, {
        businessId: actor.businessId,
        id,
        medio,
        pagadaPorId: firma.id,
        pagadaPorNombre: firma.nombre,
        ahora: new Date(),
      })
    )
    return NextResponse.json(await leerLiquidacion(prisma, actor, id))
  } catch (error) {
    return respuestaDeErrorDePlata(error, "marcando pagada una liquidación")
  }
}
