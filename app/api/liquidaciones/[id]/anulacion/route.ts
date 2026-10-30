import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { cuerpoDelPedido } from "@/lib/cuerpo-del-pedido"
import { actorDeSesion, puedeAnularLiquidacion, whereDeLiquidaciones } from "@/lib/permisos"
import { anularLiquidacion, leerLiquidacion, quienFirma, respuestaDeErrorDePlata } from "@/lib/liquidacion"

const anulacionSchema = z.object({
  motivo: z
    .string({ required_error: "Escribe por qué se anula." })
    .trim()
    .min(1, "Escribe por qué se anula.")
    .max(500, "El motivo no puede pasar de 500 caracteres."),
})

/**
 * Anula una liquidación cerrada y no pagada, con motivo, y libera lo que
 * incluía para la próxima. Sólo la dueña. Ajena: 404; pagada o ya anulada: 409.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  try {
    const { id } = await params
    const existe = await prisma.liquidacion.findFirst({ where: whereDeLiquidaciones(actor, { id }), select: { id: true } })
    if (!existe) return NextResponse.json({ error: "Liquidación no encontrada" }, { status: 404 })
    if (!puedeAnularLiquidacion(actor)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    const { motivo } = anulacionSchema.parse(await cuerpoDelPedido(request))
    const firma = await quienFirma(prisma, actor, session?.user?.id)
    if (!firma) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    await prisma.$transaction((tx) =>
      anularLiquidacion(tx, {
        businessId: actor.businessId,
        id,
        motivo,
        anuladaPorId: firma.id,
        anuladaPorNombre: firma.nombre,
        ahora: new Date(),
      })
    )
    return NextResponse.json(await leerLiquidacion(prisma, actor, id))
  } catch (error) {
    return respuestaDeErrorDePlata(error, "anulando una liquidación")
  }
}
