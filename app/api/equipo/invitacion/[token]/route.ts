import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET /api/equipo/invitacion/[token] — consultar datos de la invitación (público)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params

  const invitacion = await prisma.workerInvitation.findUnique({
    where: { token },
    include: { business: { select: { name: true, type: true } } },
  })

  if (!invitacion) {
    return NextResponse.json({ error: "Invitación no encontrada" }, { status: 404 })
  }

  if (invitacion.acceptedAt) {
    return NextResponse.json({ error: "Esta invitación ya fue aceptada" }, { status: 410 })
  }

  if (invitacion.expiresAt < new Date()) {
    return NextResponse.json({ error: "Esta invitación ha expirado" }, { status: 410 })
  }

  return NextResponse.json({
    nombre: invitacion.name,
    email: invitacion.email,
    rol: invitacion.role,
    negocio: invitacion.business.name,
    tipoNegocio: invitacion.business.type,
  })
}
