import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { fromZonedTime, toZonedTime } from "date-fns-tz"
import { prisma } from "@/lib/prisma"
import { can } from "@/lib/permissions"
import { checkPermissionWithBusiness } from "../_lib/auth"
import { DEFAULT_TZ } from "../_lib/dateRange"

const REPORT_TYPES = [
  "INGRESOS",
  "CITAS",
  "SERVICIOS",
  "TRABAJADORES",
  "CLIENTES",
  "OCUPACION",
  "CIERRES",
] as const

const scheduledReportSchema = z
  .object({
    name: z.string().min(1).max(120),
    reportType: z.enum(REPORT_TYPES),
    filters: z.record(z.any()),
    frequency: z.enum(["DIARIO", "SEMANAL", "MENSUAL"]),
    dayOfWeek: z.number().int().min(0).max(6).optional(),
    dayOfMonth: z.number().int().min(1).max(31).optional(),
    sendTime: z.string().regex(/^\d{2}:\d{2}$/),
    recipients: z.array(z.string().email()).min(1),
  })
  .refine((d) => d.frequency !== "SEMANAL" || d.dayOfWeek !== undefined, {
    message: "dayOfWeek requerido para frecuencia SEMANAL",
  })
  .refine((d) => d.frequency !== "MENSUAL" || d.dayOfMonth !== undefined, {
    message: "dayOfMonth requerido para frecuencia MENSUAL",
  })

/**
 * Calcula el próximo envío (nextSendAt, UTC) a partir de frequency/dayOfWeek/dayOfMonth/sendTime,
 * interpretados en el timezone del negocio. Toma el primer momento futuro que cumpla el patrón.
 */
function calcularNextSendAt(
  params: {
    frequency: "DIARIO" | "SEMANAL" | "MENSUAL"
    dayOfWeek?: number
    dayOfMonth?: number
    sendTime: string
  },
  timezone: string
): Date {
  const [hh, mm] = params.sendTime.split(":").map(Number)
  const ahoraLocal = toZonedTime(new Date(), timezone)

  const candidato = new Date(ahoraLocal)
  candidato.setHours(hh, mm, 0, 0)

  if (params.frequency === "DIARIO") {
    if (candidato.getTime() <= ahoraLocal.getTime()) {
      candidato.setDate(candidato.getDate() + 1)
    }
  } else if (params.frequency === "SEMANAL") {
    const targetDow = params.dayOfWeek ?? 1
    let diff = targetDow - candidato.getDay()
    if (diff < 0) diff += 7
    candidato.setDate(candidato.getDate() + diff)
    if (candidato.getTime() <= ahoraLocal.getTime()) {
      candidato.setDate(candidato.getDate() + 7)
    }
  } else {
    const targetDom = params.dayOfMonth ?? 1
    candidato.setDate(targetDom)
    if (candidato.getTime() <= ahoraLocal.getTime() || candidato.getDate() !== targetDom) {
      candidato.setMonth(candidato.getMonth() + 1)
      candidato.setDate(targetDom)
    }
  }

  const y = candidato.getFullYear()
  const m = String(candidato.getMonth() + 1).padStart(2, "0")
  const d = String(candidato.getDate()).padStart(2, "0")
  const hStr = String(candidato.getHours()).padStart(2, "0")
  const minStr = String(candidato.getMinutes()).padStart(2, "0")

  return fromZonedTime(`${y}-${m}-${d}T${hStr}:${minStr}:00`, timezone)
}

export async function GET() {
  const auth = await checkPermissionWithBusiness("reports", "schedule")
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const scheduled = await prisma.scheduledReport.findMany({
    where: { businessId: auth.member.businessId },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { user: { select: { name: true } } } } },
  })

  return NextResponse.json({ scheduled })
}

export async function POST(request: NextRequest) {
  const auth = await checkPermissionWithBusiness("reports", "schedule")
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  if (!can(auth.permissions, "reports", "schedule")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  }

  try {
    const body = await request.json()
    const datos = scheduledReportSchema.parse(body)
    const timezone = auth.timezone ?? DEFAULT_TZ

    const nextSendAt = calcularNextSendAt(
      {
        frequency: datos.frequency,
        dayOfWeek: datos.dayOfWeek,
        dayOfMonth: datos.dayOfMonth,
        sendTime: datos.sendTime,
      },
      timezone
    )

    const scheduled = await prisma.scheduledReport.create({
      data: {
        businessId: auth.member.businessId,
        createdById: auth.member.id,
        name: datos.name,
        reportType: datos.reportType,
        filters: datos.filters,
        frequency: datos.frequency,
        dayOfWeek: datos.dayOfWeek ?? null,
        dayOfMonth: datos.dayOfMonth ?? null,
        sendTime: datos.sendTime,
        recipients: datos.recipients,
        isActive: true,
        nextSendAt,
      },
    })

    return NextResponse.json(scheduled, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", detalles: error.errors }, { status: 400 })
    }
    console.error("Error creando reporte programado:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await checkPermissionWithBusiness("reports", "schedule")
  if (!auth) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  if (!can(auth.permissions, "reports", "schedule")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 })

  const existing = await prisma.scheduledReport.findFirst({
    where: { id, businessId: auth.member.businessId },
  })
  if (!existing) return NextResponse.json({ error: "No encontrado" }, { status: 404 })

  await prisma.scheduledReport.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}

// NOTA: el envío real por cron (lectura periódica de ScheduledReport con nextSendAt vencido,
// generación del reporte y despacho por email a `recipients`) está fuera del alcance de esta tarea.
// Esta ruta solo implementa el CRUD de configuración. Falta:
// - Un endpoint /api/cron/reportes-programados que recorra ScheduledReport activos con
//   nextSendAt <= now, genere el reporte correspondiente y lo envíe por email (lib/email.ts).
// - Tras enviar, actualizar lastSentAt y recalcular nextSendAt según frequency.
