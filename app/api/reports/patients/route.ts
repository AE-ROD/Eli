import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkPermissionWithBusiness } from "../_lib/auth"
import { parseRangoFechas } from "../_lib/dateRange"
import { parseGranularity, bucketKey } from "../_lib/granularity"

export async function GET(request: NextRequest) {
  const auth = await checkPermissionWithBusiness("reports", "view")
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const rango = parseRangoFechas(searchParams, auth.timezone)
  if (!rango) {
    return NextResponse.json({ error: "Parámetros from/to inválidos (YYYY-MM-DD)" }, { status: 400 })
  }

  const granularity = parseGranularity(searchParams.get("granularity"))
  const inactiveDaysThreshold = Math.max(1, parseInt(searchParams.get("inactiveDaysThreshold") ?? "90", 10) || 90)
  const businessId = auth.member.businessId

  const [totalActivos, nuevosDelPeriodo, citasDelPeriodo, todasLasCitasPorPaciente] = await Promise.all([
    prisma.patient.count({ where: { businessId } }),
    prisma.patient.findMany({
      where: { businessId, createdAt: { gte: rango.from, lte: rango.to } },
      select: { id: true, createdAt: true },
    }),
    prisma.appointment.findMany({
      where: { businessId, startTime: { gte: rango.from, lte: rango.to }, patientId: { not: null } },
      select: { id: true, patientId: true, status: true, price: true, startTime: true },
    }),
    prisma.appointment.groupBy({
      by: ["patientId"],
      where: { businessId, patientId: { not: null } },
      _max: { startTime: true },
    }),
  ])

  // timeSeries de nuevos pacientes
  const tsBuckets = new Map<string, number>()
  for (const p of nuevosDelPeriodo) {
    const key = bucketKey(p.createdAt, granularity, auth.timezone)
    tsBuckets.set(key, (tsBuckets.get(key) ?? 0) + 1)
  }
  const timeSeries = Array.from(tsBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, newPatients]) => ({ date, newPatients }))

  // Visitas y revenue por paciente dentro del período
  const porPaciente = new Map<string, { visits: number; revenue: number }>()
  for (const c of citasDelPeriodo) {
    if (!c.patientId) continue
    const cur = porPaciente.get(c.patientId) ?? { visits: 0, revenue: 0 }
    cur.visits += 1
    if (c.status === "completada") cur.revenue += c.price ?? 0
    porPaciente.set(c.patientId, cur)
  }

  const recurrentes = Array.from(porPaciente.values()).filter((v) => v.visits > 1).length
  const pacientesConCitaEnPeriodo = porPaciente.size
  const retentionRate =
    pacientesConCitaEnPeriodo > 0 ? Math.round((recurrentes / pacientesConCitaEnPeriodo) * 1000) / 10 : 0
  const totalVisitas = Array.from(porPaciente.values()).reduce((acc, v) => acc + v.visits, 0)
  const avgVisits = pacientesConCitaEnPeriodo > 0 ? totalVisitas / pacientesConCitaEnPeriodo : 0

  const patientIds = Array.from(porPaciente.keys())
  const pacientesInfo = patientIds.length
    ? await prisma.patient.findMany({
        where: { id: { in: patientIds } },
        select: { id: true, name: true, lastName: true, email: true, phone: true },
      })
    : []
  const infoById = new Map(pacientesInfo.map((p) => [p.id, p]))

  const topByVisits = Array.from(porPaciente.entries())
    .map(([patientId, v]) => ({
      patientId,
      name: infoById.get(patientId)
        ? `${infoById.get(patientId)!.name}${infoById.get(patientId)!.lastName ? " " + infoById.get(patientId)!.lastName : ""}`
        : "Desconocido",
      visits: v.visits,
      revenue: v.revenue,
    }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 10)

  const topByRevenue = Array.from(porPaciente.entries())
    .map(([patientId, v]) => ({
      patientId,
      name: infoById.get(patientId)
        ? `${infoById.get(patientId)!.name}${infoById.get(patientId)!.lastName ? " " + infoById.get(patientId)!.lastName : ""}`
        : "Desconocido",
      visits: v.visits,
      revenue: v.revenue,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)

  // Inactivos: sin cita en los últimos N días (sobre TODA la historia, no solo el rango)
  const umbralFecha = new Date()
  umbralFecha.setDate(umbralFecha.getDate() - inactiveDaysThreshold)

  const ultimaCitaPorPaciente = new Map<string, Date | null>()
  for (const g of todasLasCitasPorPaciente) {
    if (g.patientId) ultimaCitaPorPaciente.set(g.patientId, g._max.startTime)
  }

  const inactivosIds = Array.from(ultimaCitaPorPaciente.entries())
    .filter(([, ultima]) => !ultima || ultima.getTime() < umbralFecha.getTime())
    .map(([id]) => id)

  const inactivosInfo = inactivosIds.length
    ? await prisma.patient.findMany({
        where: { id: { in: inactivosIds }, businessId },
        select: { id: true, name: true, lastName: true, email: true, phone: true },
      })
    : []

  const inactive = inactivosInfo
    .map((p) => ({
      patientId: p.id,
      name: `${p.name}${p.lastName ? " " + p.lastName : ""}`,
      email: p.email,
      phone: p.phone,
      lastVisit: ultimaCitaPorPaciente.get(p.id) ?? null,
    }))
    .sort((a, b) => {
      if (!a.lastVisit && !b.lastVisit) return 0
      if (!a.lastVisit) return -1
      if (!b.lastVisit) return 1
      return a.lastVisit.getTime() - b.lastVisit.getTime()
    })

  return NextResponse.json({
    summary: {
      totalActive: totalActivos,
      newInPeriod: nuevosDelPeriodo.length,
      recurrent: recurrentes,
      retentionRate,
      avgVisits,
    },
    timeSeries,
    topByVisits,
    topByRevenue,
    inactive,
  })
}
