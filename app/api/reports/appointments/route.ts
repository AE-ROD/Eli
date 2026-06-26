import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkPermissionWithBusiness } from "../_lib/auth"
import { parseRangoFechas } from "../_lib/dateRange"
import { parseGranularity, bucketKey } from "../_lib/granularity"
import { DIAS_SEMANA } from "../_lib/dateRange"
import { toZonedTime } from "date-fns-tz"

const ESTADOS_CANCELADOS = ["cancelada"]
const ESTADOS_COMPLETADOS = ["completada"]
const ESTADOS_PENDIENTES = ["pendiente", "confirmada", "en-progreso"]

export async function GET(request: NextRequest) {
  const auth = await checkPermissionWithBusiness("reports", "view")
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const rango = parseRangoFechas(searchParams, auth.timezone)
  if (!rango) {
    return NextResponse.json({ error: "Parámetros from/to inválidos (YYYY-MM-DD)" }, { status: 400 })
  }

  const granularity = parseGranularity(searchParams.get("granularity"))
  const workerId = searchParams.get("workerId") || undefined
  const serviceId = searchParams.get("serviceId") || undefined
  const businessId = auth.member.businessId

  const where = {
    businessId,
    startTime: { gte: rango.from, lte: rango.to },
    ...(workerId ? { memberId: workerId } : {}),
    ...(serviceId ? { serviceId } : {}),
  }

  const citas = await prisma.appointment.findMany({
    where,
    select: {
      id: true,
      startTime: true,
      status: true,
      memberId: true,
      serviceId: true,
      title: true,
    },
  })

  const total = citas.length
  const completed = citas.filter((c) => ESTADOS_COMPLETADOS.includes(c.status)).length
  const cancelled = citas.filter((c) => ESTADOS_CANCELADOS.includes(c.status)).length
  // No existe estado "no-show" todavía en el dominio (string libre); se reporta en 0
  // hasta que el modelo de Appointment incorpore ese estado.
  const noShow = 0
  const pending = citas.filter((c) => ESTADOS_PENDIENTES.includes(c.status)).length

  const completionRate = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0
  const cancellationRate = total > 0 ? Math.round((cancelled / total) * 1000) / 10 : 0
  const noShowRate = 0

  // timeSeries
  const tsBuckets = new Map<string, number>()
  for (const c of citas) {
    const key = bucketKey(c.startTime, granularity, auth.timezone)
    tsBuckets.set(key, (tsBuckets.get(key) ?? 0) + 1)
  }
  const timeSeries = Array.from(tsBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))

  // byStatus
  const statusMap = new Map<string, number>()
  for (const c of citas) {
    statusMap.set(c.status, (statusMap.get(c.status) ?? 0) + 1)
  }
  const byStatus = Array.from(statusMap.entries()).map(([status, count]) => ({ status, count }))

  // byService
  const serviceMap = new Map<string, number>()
  for (const c of citas) {
    const key = c.serviceId ?? "sin-servicio"
    serviceMap.set(key, (serviceMap.get(key) ?? 0) + 1)
  }
  const serviceIds = Array.from(serviceMap.keys()).filter((k) => k !== "sin-servicio")
  const services = serviceIds.length
    ? await prisma.service.findMany({ where: { id: { in: serviceIds } }, select: { id: true, name: true } })
    : []
  const serviceNombre = new Map(services.map((s) => [s.id, s.name]))
  const byService = Array.from(serviceMap.entries())
    .map(([serviceId, count]) => ({
      serviceId,
      name: serviceId === "sin-servicio" ? "Sin servicio" : serviceNombre.get(serviceId) ?? "Servicio eliminado",
      count,
    }))
    .sort((a, b) => b.count - a.count)

  // byWorker
  const workerMap = new Map<string, number>()
  for (const c of citas) {
    const key = c.memberId ?? "sin-asignar"
    workerMap.set(key, (workerMap.get(key) ?? 0) + 1)
  }
  const memberIds = Array.from(workerMap.keys()).filter((k) => k !== "sin-asignar")
  const members = memberIds.length
    ? await prisma.businessMember.findMany({
        where: { id: { in: memberIds } },
        select: { id: true, user: { select: { name: true } } },
      })
    : []
  const memberNombre = new Map(members.map((m) => [m.id, m.user.name]))
  const byWorker = Array.from(workerMap.entries())
    .map(([memberId, count]) => ({
      memberId,
      name: memberId === "sin-asignar" ? "Sin asignar" : memberNombre.get(memberId) ?? "Desconocido",
      count,
    }))
    .sort((a, b) => b.count - a.count)

  // byDayOfWeek
  const dowCounts = new Array(7).fill(0)
  for (const c of citas) {
    const local = toZonedTime(c.startTime, auth.timezone)
    dowCounts[local.getDay()] += 1
  }
  const byDayOfWeek = dowCounts.map((count, i) => ({ dayOfWeek: i, label: DIAS_SEMANA[i], count }))

  // byHour (heatmap simple por hora del día)
  const hourCounts = new Array(24).fill(0)
  for (const c of citas) {
    const local = toZonedTime(c.startTime, auth.timezone)
    hourCounts[local.getHours()] += 1
  }
  const byHour = hourCounts.map((count, hour) => ({ hour, count }))

  return NextResponse.json({
    summary: {
      total,
      completed,
      cancelled,
      noShow,
      pending,
      completionRate,
      cancellationRate,
      noShowRate,
    },
    timeSeries,
    byStatus,
    byService,
    byWorker,
    byDayOfWeek,
    byHour,
  })
}
