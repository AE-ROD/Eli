import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion, puedeGestionarEquipo } from "@/lib/permisos"
import { ROLES_QUE_ATIENDEN } from "@/lib/agenda-publica"

// GET /api/equipo/miembros — lista mínima para el selector de profesional de
// la agenda: sólo quienes atienden, con la misma regla que la reserva pública
// (`ROLES_QUE_ATIENDEN`). El encargado no se ofrece: no atiende citas (#140).
export async function GET() {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)

  if (!actor || !puedeGestionarEquipo(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const miembros = await prisma.businessMember.findMany({
    where: { businessId: actor.businessId, role: { in: [...ROLES_QUE_ATIENDEN] } },
    select: { id: true, role: true, user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
    take: 100,
  })

  return NextResponse.json({
    miembros: miembros.map((m) => ({ id: m.id, nombre: m.user.name, rol: m.role })),
  })
}
