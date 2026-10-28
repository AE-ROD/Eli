import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion, veMiPlata } from "@/lib/permisos"
import { respuestaDeErrorDePlata } from "@/lib/liquidacion"
import { calcularMiPlata } from "@/lib/mi-plata"

/**
 * Mi plata de quien está en sesión. Usa sólo `actor.memberId`: no lee nada
 * del pedido, así que `?miembro=otro` no cambia nada. Sin `memberId` (la
 * dueña no es miembro): 401.
 */
export async function GET() {
  const actor = actorDeSesion(await getServerSession(authOptions))
  if (!actor || !veMiPlata(actor) || !actor.memberId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const plata = await calcularMiPlata(prisma, { businessId: actor.businessId, memberId: actor.memberId, ahora: new Date() })
    if (!plata) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    return NextResponse.json(plata)
  } catch (error) {
    return respuestaDeErrorDePlata(error, "calculando Mi plata")
  }
}
