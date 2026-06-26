import { NextRequest, NextResponse } from "next/server"
import { can } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { checkPermissionWithBusiness } from "../_lib/auth"
import { parseRangoFechas, rangoAnterior, calcularVariacionPct } from "../_lib/dateRange"
import { parseGranularity, bucketKey } from "../_lib/granularity"

export async function GET(request: NextRequest) {
  const auth = await checkPermissionWithBusiness("reports", "view")
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  if (!can(auth.permissions, "reports", "viewRevenue")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const rango = parseRangoFechas(searchParams, auth.timezone)
  if (!rango) {
    return NextResponse.json({ error: "Parámetros from/to inválidos (YYYY-MM-DD)" }, { status: 400 })
  }

  const granularity = parseGranularity(searchParams.get("granularity"))
  const workerId = searchParams.get("workerId") || undefined
  const businessId = auth.member.businessId

  const whereBase = {
    businessId,
    status: "completada" as const,
    price: { not: null },
    startTime: { gte: rango.from, lte: rango.to },
    ...(workerId ? { memberId: workerId } : {}),
  }

  const anterior = rangoAnterior(rango)
  const whereAnterior = {
    businessId,
    status: "completada" as const,
    price: { not: null },
    startTime: { gte: anterior.from, lte: anterior.to },
    ...(workerId ? { memberId: workerId } : {}),
  }

  const [citas, agregadoAnterior, citasPorTrabajador, citasPorServicio, cierres] = await Promise.all([
    prisma.appointment.findMany({
      where: whereBase,
      select: { id: true, startTime: true, price: true, memberId: true, serviceId: true, title: true },
    }),
    prisma.appointment.aggregate({
      where: whereAnterior,
      _sum: { price: true },
    }),
    prisma.appointment.groupBy({
      by: ["memberId"],
      where: whereBase,
      _sum: { price: true },
      _count: { id: true },
    }),
    prisma.appointment.groupBy({
      by: ["serviceId"],
      where: whereBase,
      _sum: { price: true },
      _count: { id: true },
    }),
    prisma.shiftClose.findMany({
      where: { businessId, shiftDate: { gte: rango.from, lte: rango.to } },
      select: { paymentBreakdown: true },
    }),
  ])

  const totalRevenue = citas.reduce((acc, c) => acc + (c.price ?? 0), 0)
  const totalAppointments = citas.length
  const avgPerAppointment = totalAppointments > 0 ? totalRevenue / totalAppointments : 0
  const revenueAnterior = agregadoAnterior._sum.price ?? 0
  const comparisonPct = calcularVariacionPct(totalRevenue, revenueAnterior)

  // timeSeries por granularidad
  const buckets = new Map<string, { revenue: number; appointments: number }>()
  for (const c of citas) {
    const key = bucketKey(c.startTime, granularity, auth.timezone)
    const cur = buckets.get(key) ?? { revenue: 0, appointments: 0 }
    cur.revenue += c.price ?? 0
    cur.appointments += 1
    buckets.set(key, cur)
  }
  const timeSeries = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v }))

  // byWorker: resolver nombres
  const memberIds = citasPorTrabajador.map((g) => g.memberId).filter((id): id is string => !!id)
  const members = memberIds.length
    ? await prisma.businessMember.findMany({
        where: { id: { in: memberIds } },
        select: { id: true, user: { select: { name: true } } },
      })
    : []
  const memberNombre = new Map(members.map((m) => [m.id, m.user.name]))

  const byWorker = citasPorTrabajador
    .map((g) => ({
      memberId: g.memberId,
      name: g.memberId ? memberNombre.get(g.memberId) ?? "Desconocido" : "Sin asignar",
      revenue: g._sum.price ?? 0,
      appointments: g._count.id,
    }))
    .sort((a, b) => b.revenue - a.revenue)

  // byService: resolver nombres
  const serviceIds = citasPorServicio.map((g) => g.serviceId).filter((id): id is string => !!id)
  const services = serviceIds.length
    ? await prisma.service.findMany({ where: { id: { in: serviceIds } }, select: { id: true, name: true } })
    : []
  const serviceNombre = new Map(services.map((s) => [s.id, s.name]))

  const byService = citasPorServicio
    .map((g) => ({
      serviceId: g.serviceId,
      name: g.serviceId ? serviceNombre.get(g.serviceId) ?? "Servicio eliminado" : "Sin servicio",
      revenue: g._sum.price ?? 0,
      appointments: g._count.id,
    }))
    .sort((a, b) => b.revenue - a.revenue)

  // byPaymentMethod: agregando ShiftClose.paymentBreakdown (Json) del rango.
  // No existe método de pago por cita — se deriva de los cierres de turno declarados.
  const byPaymentMethodMap = new Map<string, number>()
  for (const cierre of cierres) {
    const breakdown = cierre.paymentBreakdown
    if (breakdown && typeof breakdown === "object" && !Array.isArray(breakdown)) {
      for (const [metodo, monto] of Object.entries(breakdown as Record<string, unknown>)) {
        const valor = typeof monto === "number" ? monto : Number(monto) || 0
        byPaymentMethodMap.set(metodo, (byPaymentMethodMap.get(metodo) ?? 0) + valor)
      }
    }
  }
  const byPaymentMethod = Array.from(byPaymentMethodMap.entries()).map(([method, amount]) => ({
    method,
    amount,
  }))

  return NextResponse.json({
    summary: {
      totalRevenue,
      avgPerAppointment,
      totalAppointments,
      comparisonPct,
    },
    timeSeries,
    byWorker,
    byService,
    byPaymentMethod,
  })
}
