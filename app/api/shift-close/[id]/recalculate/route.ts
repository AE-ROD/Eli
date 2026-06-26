import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkPermission, can } from "@/lib/permissions"
import { resolverVentanaTurno, calcularResumenCitas, DEFAULT_TZ } from "../../_lib/calculo"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const acceso = await checkPermission("shiftClose", "edit")
  if (!acceso) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const { member, permissions } = acceso

  const { id } = await params
  const cierre = await prisma.shiftClose.findFirst({
    where: { id, businessId: member.businessId },
  })
  if (!cierre) {
    return NextResponse.json({ error: "Cierre de turno no encontrado" }, { status: 404 })
  }

  const puedeRevisar = can(permissions, "shiftClose", "review")
  const esPropio = cierre.closedById === member.id
  if (!esPropio && !puedeRevisar) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  }

  const business = await prisma.business.findUnique({
    where: { id: member.businessId },
    select: { timezone: true },
  })
  const tz = business?.timezone ?? DEFAULT_TZ

  const { inicio, fin } = resolverVentanaTurno(
    cierre.shiftDate.toISOString(),
    tz,
    cierre.shiftStartTime?.toISOString(),
    cierre.shiftEndTime?.toISOString()
  )

  const puedeVerTodo = can(permissions, "shiftClose", "viewAll")
  const resumen = await calcularResumenCitas(
    member.businessId,
    inicio,
    fin,
    puedeVerTodo ? null : member.id
  )

  const actualizado = await prisma.shiftClose.update({
    where: { id },
    data: {
      appointmentsTotal: resumen.appointmentsTotal,
      appointmentsCompleted: resumen.appointmentsCompleted,
      appointmentsCancelled: resumen.appointmentsCancelled,
      appointmentsNoShow: resumen.appointmentsNoShow,
      appointmentsPending: resumen.appointmentsPending,
      expectedRevenue: resumen.expectedRevenue,
    },
    include: {
      closedBy: { select: { id: true, user: { select: { name: true } } } },
      reviewedBy: { select: { id: true, user: { select: { name: true } } } },
    },
  })

  return NextResponse.json(actualizado)
}
