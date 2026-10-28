import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion, puedeGestionarBloqueoDe, whereDeBloqueos } from "@/lib/permisos"

/**
 * Quitar un bloqueo de horario. Primero se busca entre los que el actor ve
 * (`whereDeBloqueos`): de otro negocio, de un colega para el profesional, o
 * inexistente, es 404 y no se confirma nada. Visto pero sin permiso para
 * quitarlo (un profesional y un bloqueo de todo el negocio) es 401, como los
 * horarios.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params
  const bloqueo = await prisma.timeBlock.findFirst({
    where: whereDeBloqueos(actor, { id }),
    select: { id: true, businessId: true, memberId: true },
  })
  if (!bloqueo) {
    return NextResponse.json({ error: "Bloqueo no encontrado" }, { status: 404 })
  }

  const miembro = bloqueo.memberId ? { id: bloqueo.memberId, businessId: bloqueo.businessId } : null
  if (!puedeGestionarBloqueoDe(actor, miembro)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  // Con el negocio en el `where`, aunque ya se verificó: el borrado no
  // depende de que la búsqueda de arriba siga ahí.
  await prisma.timeBlock.deleteMany({ where: { id: bloqueo.id, businessId: actor.businessId } })

  return NextResponse.json({ mensaje: "Bloqueo quitado" })
}
