import { NextRequest, NextResponse } from "next/server"
import { toZonedTime } from "date-fns-tz"
import { prisma } from "@/lib/prisma"
import { checkPermissionWithBusiness } from "../_lib/auth"
import { parseRangoFechas, DIAS_SEMANA } from "../_lib/dateRange"

const ESTADOS_OCUPAN_SLOT = ["pendiente", "confirmada", "en-progreso", "completada"]

export async function GET(request: NextRequest) {
  const auth = await checkPermissionWithBusiness("reports", "view")
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const rango = parseRangoFechas(searchParams, auth.timezone)
  if (!rango) {
    return NextResponse.json({ error: "Parámetros from/to inválidos (YYYY-MM-DD)" }, { status: 400 })
  }

  const businessId = auth.member.businessId

  const [schedules, citas] = await Promise.all([
    prisma.workSchedule.findMany({
      where: { businessId, active: true },
      select: { dayOfWeek: true, startTime: true, endTime: true, memberId: true },
    }),
    prisma.appointment.findMany({
      where: {
        businessId,
        startTime: { gte: rango.from, lte: rango.to },
        status: { in: ESTADOS_OCUPAN_SLOT },
      },
      select: { startTime: true, endTime: true },
    }),
  ])

  // Slots disponibles por (dayOfWeek, hour) — contamos horas-bloque cubiertas por al menos
  // un WorkSchedule activo. Si hay varios miembros con horarios en el mismo dayOfWeek/hour,
  // contamos 1 slot por miembro (capacidad real de atención simultánea).
  const slotsDisponibles = new Map<string, number>() // key: `${dow}-${hour}` -> cantidad de miembros disponibles esa hora
  for (const s of schedules) {
    const [sh] = s.startTime.split(":").map(Number)
    const [eh, em] = s.endTime.split(":").map(Number)
    const horaFin = em > 0 ? eh + 1 : eh // hora parcial cuenta como hora completa de disponibilidad
    for (let h = sh; h < horaFin; h++) {
      const key = `${s.dayOfWeek}-${h}`
      slotsDisponibles.set(key, (slotsDisponibles.get(key) ?? 0) + 1)
    }
  }

  // Multiplicamos disponibilidad por cantidad de veces que ese dayOfWeek aparece en el rango,
  // para tener el total de slots-hora disponibles en el período (no solo un patrón semanal).
  const dowOccurrences = new Array(7).fill(0)
  {
    const cursor = new Date(rango.from)
    cursor.setHours(0, 0, 0, 0)
    const end = new Date(rango.to)
    while (cursor.getTime() <= end.getTime()) {
      dowOccurrences[cursor.getDay()] += 1
      cursor.setDate(cursor.getDate() + 1)
    }
  }

  const totalSlotsDisponibles = new Map<string, number>() // key `${dow}-${hour}` -> total en el rango
  for (const [key, porSemana] of slotsDisponibles.entries()) {
    const [dowStr] = key.split("-")
    const dow = Number(dowStr)
    totalSlotsDisponibles.set(key, porSemana * dowOccurrences[dow])
  }

  // Slots ocupados: cada cita ocupa la(s) hora(s) que cubre según startTime/endTime
  const slotsOcupados = new Map<string, number>()
  for (const c of citas) {
    const inicioLocal = toZonedTime(c.startTime, auth.timezone)
    const finLocal = toZonedTime(c.endTime, auth.timezone)
    const dow = inicioLocal.getDay()
    let h = inicioLocal.getHours()
    const horaFin = finLocal.getMinutes() > 0 || finLocal.getHours() === h ? finLocal.getHours() : finLocal.getHours() - 1
    const ultimaHora = Math.max(h, horaFin)
    while (h <= ultimaHora) {
      const key = `${dow}-${h}`
      slotsOcupados.set(key, (slotsOcupados.get(key) ?? 0) + 1)
      h++
    }
  }

  const heatmap: { dayOfWeek: number; hour: number; available: number; booked: number; rate: number }[] = []
  let totalDisponible = 0
  let totalOcupado = 0

  for (let dow = 0; dow < 7; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      const key = `${dow}-${hour}`
      const available = totalSlotsDisponibles.get(key) ?? 0
      const booked = Math.min(slotsOcupados.get(key) ?? 0, available || (slotsOcupados.get(key) ?? 0))
      if (available > 0 || booked > 0) {
        const rate = available > 0 ? Math.round((booked / available) * 1000) / 10 : 0
        heatmap.push({ dayOfWeek: dow, hour, available, booked, rate })
        totalDisponible += available
        totalOcupado += booked
      }
    }
  }

  const globalRate = totalDisponible > 0 ? Math.round((totalOcupado / totalDisponible) * 1000) / 10 : 0

  const sorted = [...heatmap].filter((h) => h.available > 0).sort((a, b) => b.rate - a.rate)
  const peakHours = sorted.slice(0, 5)
  const quietHours = sorted.slice(-5).reverse()

  // byDayOfWeek agregado
  const byDayOfWeekMap = new Map<number, { available: number; booked: number }>()
  for (const h of heatmap) {
    const cur = byDayOfWeekMap.get(h.dayOfWeek) ?? { available: 0, booked: 0 }
    cur.available += h.available
    cur.booked += h.booked
    byDayOfWeekMap.set(h.dayOfWeek, cur)
  }
  const byDayOfWeek = Array.from({ length: 7 }, (_, dow) => {
    const v = byDayOfWeekMap.get(dow) ?? { available: 0, booked: 0 }
    return {
      dayOfWeek: dow,
      label: DIAS_SEMANA[dow],
      available: v.available,
      booked: v.booked,
      rate: v.available > 0 ? Math.round((v.booked / v.available) * 1000) / 10 : 0,
    }
  })

  const slotsWasted = totalDisponible - totalOcupado

  return NextResponse.json({
    globalRate,
    heatmap,
    peakHours,
    quietHours,
    byDayOfWeek,
    slotsWasted,
  })
}
