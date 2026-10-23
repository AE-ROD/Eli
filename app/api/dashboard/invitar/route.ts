import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion, puedeInvitarNegocios } from "@/lib/permisos"
import type { DatosDeInvitacion } from "@/lib/invitar-negocios"

/**
 * El enlace de invitación del negocio de la sesión y su estado. Sólo el dueño
 * (401 para el resto: no es un recurso ajeno, es algo que su rol no ve).
 *
 * De los negocios invitados sólo viaja cuántos son: ni nombres, ni ids, ni
 * cuáles ya recibieron su primera reserva. Son negocios de otra gente.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor || !puedeInvitarNegocios(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const businessId = actor.businessId

  const [negocio, registrados] = await Promise.all([
    prisma.business.findUnique({
      where: { id: businessId },
      select: { codigoInvitacion: true, extensionPorReferidoAt: true },
    }),
    prisma.business.count({ where: { invitadoPorId: businessId } }),
  ])

  if (!negocio) {
    return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 })
  }

  const datos: DatosDeInvitacion = {
    codigo: negocio.codigoInvitacion,
    yaSumoLosDias: negocio.extensionPorReferidoAt !== null,
    registrados,
  }
  return NextResponse.json(datos)
}
