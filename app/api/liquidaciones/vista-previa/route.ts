import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion, puedeCerrarLiquidacion } from "@/lib/permisos"
import { respuestaDeErrorDePlata, vistaPrevia } from "@/lib/liquidacion"

/**
 * La próxima liquidación de `?miembro=`, calculada sin guardar nada. Es el
 * paso previo a cerrarla, así que la ve quien cierra: la dueña (muestra los
 * % con que se congelará lo pendiente). `?excluir=a,b` deja afuera esos
 * movimientos, como quedarían al cerrar.
 */
export async function GET(request: NextRequest) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !puedeCerrarLiquidacion(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const miembro = searchParams.get("miembro")
    if (!miembro) return NextResponse.json({ error: "Elige a quién liquidar." }, { status: 400 })
    const excluir = (searchParams.get("excluir") ?? "").split(",").filter(Boolean).slice(0, 200)

    const vista = await vistaPrevia(prisma, {
      businessId: actor.businessId,
      memberId: miembro,
      excluirMovimientos: excluir,
      ahora: new Date(),
    })
    if (!vista) return NextResponse.json({ error: "Profesional no encontrado" }, { status: 404 })
    return NextResponse.json(vista)
  } catch (error) {
    return respuestaDeErrorDePlata(error, "calculando la vista previa de una liquidación")
  }
}
