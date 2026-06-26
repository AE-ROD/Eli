import { NextRequest, NextResponse } from "next/server"
import { can } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { checkPermissionWithBusiness } from "../_lib/auth"
import { parseRangoFechas } from "../_lib/dateRange"

/**
 * Calcula la cantidad de slots de 30 min disponibles para un miembro entre rango.from y rango.to,
 * a partir de sus WorkSchedule (dayOfWeek + startTime/endTime). Itera día por día del rango.
 */
function calcularMinutosDisponibles(
  schedules: { dayOfWeek: number; startTime: string; endTime: string }[],
  from: Date,
  to: Date
): number {
  if (schedules.length === 0) return 0

  const porDia = new Map<number, { startTime: string; endTime: string }[]>()
  for (const s of schedules) {
    const arr = porDia.get(s.dayOfWeek) ?? []
    arr.push(s)
    porDia.set(s.dayOfWeek, arr)
  }

  let totalMin = 0
  const cursor = new Date(from)
  cursor.setHours(0, 0, 0, 0)
  const end = new Date(to)

  while (cursor.getTime() <= end.getTime()) {
    const dow = cursor.getDay()
    const bloques = porDia.get(dow) ?? []
    for (const b of bloques) {
      const [sh, sm] = b.startTime.split(":").map(Number)
      const [eh, em] = b.endTime.split(":").map(Number)
      const minutos = eh * 60 + em - (sh * 60 + sm)
      if (minutos > 0) totalMin += minutos
    }
    cursor.setDate(cursor.getDate() + 1)
  }

  return totalMin
}

export async function GET(request: NextRequest) {
  const auth = await checkPermissionWithBusiness("reports", "view")
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  if (!can(auth.permissions, "reports", "viewStaff")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const rango = parseRangoFechas(searchParams, auth.timezone)
  if (!rango) {
    return NextResponse.json({ error: "Parámetros from/to inválidos (YYYY-MM-DD)" }, { status: 400 })
  }

  const businessId = auth.member.businessId

  const [members, citas, schedules] = await Promise.all([
    prisma.businessMember.findMany({
      where: { businessId },
      select: { id: true, role: true, isOwner: true, user: { select: { name: true } } },
    }),
    prisma.appointment.findMany({
      where: { businessId, startTime: { gte: rango.from, lte: rango.to }, memberId: { not: null } },
      select: { id: true, memberId: true, status: true, price: true, startTime: true, endTime: true },
    }),
    prisma.workSchedule.findMany({
      where: { businessId, active: true },
      select: { memberId: true, dayOfWeek: true, startTime: true, endTime: true },
    }),
  ])

  const schedulesByMember = new Map<string, { dayOfWeek: number; startTime: string; endTime: string }[]>()
  for (const s of schedules) {
    if (!s.memberId) continue
    const arr = schedulesByMember.get(s.memberId) ?? []
    arr.push({ dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime })
    schedulesByMember.set(s.memberId, arr)
  }

  const citasByMember = new Map<string, typeof citas>()
  for (const c of citas) {
    if (!c.memberId) continue
    const arr = citasByMember.get(c.memberId) ?? []
    arr.push(c)
    citasByMember.set(c.memberId, arr)
  }

  const workers = members.map((m) => {
    const citasMember = citasByMember.get(m.id) ?? []
    const totalAppointments = citasMember.length
    const completedAppointments = citasMember.filter((c) => c.status === "completada").length
    const cancelledAppointments = citasMember.filter((c) => c.status === "cancelada").length
    const revenue = citasMember
      .filter((c) => c.status === "completada")
      .reduce((acc, c) => acc + (c.price ?? 0), 0)
    const avgTicket = completedAppointments > 0 ? revenue / completedAppointments : 0

    // Ocupación: minutos reservados (no cancelados) / minutos disponibles según WorkSchedule
    const scheduleMember = schedulesByMember.get(m.id) ?? []
    const minutosDisponibles = calcularMinutosDisponibles(scheduleMember, rango.from, rango.to)
    const minutosReservados = citasMember
      .filter((c) => c.status !== "cancelada")
      .reduce((acc, c) => acc + (c.endTime.getTime() - c.startTime.getTime()) / 60000, 0)
    const occupancyRate =
      minutosDisponibles > 0 ? Math.round((minutosReservados / minutosDisponibles) * 1000) / 10 : 0

    return {
      memberId: m.id,
      name: m.user.name,
      role: m.role,
      isOwner: m.isOwner,
      totalAppointments,
      completedAppointments,
      cancelledAppointments,
      revenue,
      avgTicket,
      occupancyRate,
    }
  })

  const ranking = {
    byAppointments: [...workers].sort((a, b) => b.totalAppointments - a.totalAppointments).map((w) => w.memberId),
    byRevenue: [...workers].sort((a, b) => b.revenue - a.revenue).map((w) => w.memberId),
    byOccupancy: [...workers].sort((a, b) => b.occupancyRate - a.occupancyRate).map((w) => w.memberId),
  }

  return NextResponse.json({ workers, ranking })
}
