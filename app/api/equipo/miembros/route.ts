import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion, puedeGestionarEquipo } from "@/lib/permisos"

// GET /api/equipo/miembros — lista mínima para el selector de profesional
export async function GET() {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)

  if (!actor || !puedeGestionarEquipo(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const miembros = await prisma.businessMember.findMany({
    where: { businessId: actor.businessId },
    select: { id: true, role: true, user: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
    take: 100,
  })

  return NextResponse.json({
    miembros: miembros.map((m) => ({ id: m.id, nombre: m.user.name, rol: m.role })),
  })
}
