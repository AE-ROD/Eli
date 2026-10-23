import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion, veLaListaDeInicio } from "@/lib/permisos"

/**
 * Anota cuándo el dueño compartió (copió) su enlace de reservas por primera
 * vez. Sólo la primera: el update está condicionado a que la fecha siga
 * vacía, así una segunda copia, o dos a la vez, no la corren. Sin cuerpo: el
 * negocio es siempre el de la sesión, nunca uno que mande el pedido.
 *
 * Responde `marcado: true` sólo si esta llamada fue la que la anotó.
 */
export async function POST() {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor || !veLaListaDeInicio(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { count } = await prisma.business.updateMany({
    where: { id: actor.businessId, enlaceCompartidoAt: null },
    data: { enlaceCompartidoAt: new Date() },
  })

  return NextResponse.json({ marcado: count === 1 })
}
