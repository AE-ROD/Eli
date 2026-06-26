import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkPermissionWithBusiness } from "../_lib/auth"
import { parseRangoFechas } from "../_lib/dateRange"

export async function GET(request: NextRequest) {
  const auth = await checkPermissionWithBusiness("reports", "view")
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const rango = parseRangoFechas(searchParams, auth.timezone)
  if (!rango) {
    return NextResponse.json({ error: "Parámetros from/to inválidos (YYYY-MM-DD)" }, { status: 400 })
  }

  const businessId = auth.member.businessId

  const citas = await prisma.appointment.findMany({
    where: { businessId, startTime: { gte: rango.from, lte: rango.to } },
    select: { id: true, serviceId: true, title: true, status: true, price: true, startTime: true, endTime: true },
  })

  const services = await prisma.service.findMany({
    where: { businessId },
    select: { id: true, name: true, duration: true, price: true, active: true },
  })
  const serviceById = new Map(services.map((s) => [s.id, s]))

  type Acc = {
    serviceId: string
    name: string
    total: number
    completed: number
    cancelled: number
    revenue: number
    durationSumMin: number
    durationCount: number
  }
  const map = new Map<string, Acc>()

  for (const c of citas) {
    const key = c.serviceId ?? "sin-servicio"
    const svc = c.serviceId ? serviceById.get(c.serviceId) : undefined
    const cur =
      map.get(key) ??
      ({
        serviceId: key,
        name: svc?.name ?? (c.serviceId ? "Servicio eliminado" : "Sin servicio"),
        total: 0,
        completed: 0,
        cancelled: 0,
        revenue: 0,
        durationSumMin: 0,
        durationCount: 0,
      } satisfies Acc)

    cur.total += 1
    if (c.status === "completada") {
      cur.completed += 1
      cur.revenue += c.price ?? 0
    }
    if (c.status === "cancelada") cur.cancelled += 1

    const durMin = (c.endTime.getTime() - c.startTime.getTime()) / 60000
    if (Number.isFinite(durMin) && durMin > 0) {
      cur.durationSumMin += durMin
      cur.durationCount += 1
    }

    map.set(key, cur)
  }

  const totalCitas = citas.length
  const ranking = Array.from(map.values())
    .map((s) => ({
      serviceId: s.serviceId,
      name: s.name,
      totalAppointments: s.total,
      revenue: s.revenue,
      avgDurationMin: s.durationCount > 0 ? Math.round(s.durationSumMin / s.durationCount) : 0,
      cancellationRate: s.total > 0 ? Math.round((s.cancelled / s.total) * 1000) / 10 : 0,
      pctOfTotal: totalCitas > 0 ? Math.round((s.total / totalCitas) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.totalAppointments - a.totalAppointments)

  const distribution = ranking.map((r) => ({ name: r.name, value: r.totalAppointments }))

  return NextResponse.json({ ranking, distribution })
}
