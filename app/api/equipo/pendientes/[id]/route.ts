import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion, puedeGestionarEquipo } from "@/lib/permisos"

/**
 * DELETE /api/equipo/pendientes/[id] — anula una invitación que nadie aceptó:
 * el enlace deja de servir y el correo queda libre para invitarlo de nuevo.
 *
 * Fuera de `/api/equipo/invitacion`, a propósito: ese prefijo es el de
 * aceptar por token, sin sesión, y `proxy.ts` lo deja sin el límite del
 * panel. Esta ruta sí lo lleva.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)

  if (!actor || !puedeGestionarEquipo(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params

  // El negocio y "sin aceptar" van en el mismo `where` que borra: una
  // invitación de otro negocio, una ya aceptada o una que no existe no se
  // tocan y responden igual, 404.
  const { count } = await prisma.workerInvitation.deleteMany({
    where: { id, businessId: actor.businessId, acceptedAt: null },
  })
  if (count === 0) {
    return NextResponse.json({ error: "Invitación no encontrada" }, { status: 404 })
  }

  return NextResponse.json({ mensaje: "Invitación anulada" })
}
