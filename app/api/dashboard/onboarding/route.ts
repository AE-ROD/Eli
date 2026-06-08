import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const businessId = (session.user as { businessId?: string }).businessId
  if (!businessId) {
    return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 })
  }

  const [servicios, horarios, citas, negocio] = await Promise.all([
    prisma.service.count({ where: { businessId, active: true } }),
    prisma.workSchedule.count({ where: { businessId, active: true } }),
    prisma.appointment.count({ where: { businessId } }),
    prisma.business.findUnique({ where: { id: businessId }, select: { slug: true } }),
  ])

  return NextResponse.json({
    tieneServicio: servicios > 0,
    tieneHorario: horarios > 0,
    tienePrimeraCita: citas > 0,
    slug: negocio?.slug ?? "",
  })
}
