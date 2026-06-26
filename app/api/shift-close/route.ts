import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { checkPermission, can } from "@/lib/permissions"
import { resolverVentanaTurno, calcularResumenCitas, DEFAULT_TZ } from "./_lib/calculo"

const shiftCloseCreateSchema = z.object({
  shiftDate: z.string().min(1),
  shiftPeriod: z.string().optional(),
  shiftStartTime: z.string().optional(),
  shiftEndTime: z.string().optional(),
})

export async function GET(request: NextRequest) {
  const acceso = await checkPermission("shiftClose", "view")
  if (!acceso) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const { member, permissions } = acceso

  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
  const limit = Math.min(50, parseInt(searchParams.get("limit") ?? "20"))
  const from = searchParams.get("from")
  const to = searchParams.get("to")
  const workerId = searchParams.get("workerId")
  const status = searchParams.get("status")
  const skip = (page - 1) * limit

  const puedeVerTodo = can(permissions, "shiftClose", "viewAll")

  const where = {
    businessId: member.businessId,
    ...(puedeVerTodo
      ? workerId
        ? { closedById: workerId }
        : {}
      : { closedById: member.id }),
    ...((from || to) && {
      shiftDate: {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(to) }),
      },
    }),
    ...(status && { status: status as "BORRADOR" | "CERRADO" | "REVISADO" }),
  }

  const [cierres, total] = await Promise.all([
    prisma.shiftClose.findMany({
      where,
      include: {
        closedBy: { select: { id: true, user: { select: { name: true } } } },
        reviewedBy: { select: { id: true, user: { select: { name: true } } } },
      },
      orderBy: { shiftDate: "desc" },
      take: limit,
      skip,
    }),
    prisma.shiftClose.count({ where }),
  ])

  return NextResponse.json({
    cierres,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
  })
}

export async function POST(request: NextRequest) {
  const acceso = await checkPermission("shiftClose", "create")
  if (!acceso) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const { member, permissions } = acceso

  try {
    const body = await request.json()
    const datos = shiftCloseCreateSchema.parse(body)

    // ¿Ya existe un cierre CERRADO/REVISADO para esta combinación?
    const existente = await prisma.shiftClose.findFirst({
      where: {
        businessId: member.businessId,
        shiftDate: new Date(datos.shiftDate),
        shiftPeriod: datos.shiftPeriod ?? null,
        closedById: member.id,
      },
    })

    if (existente && existente.status !== "BORRADOR") {
      return NextResponse.json(
        { error: "Ya existe un cierre de turno cerrado para esta fecha/período/responsable" },
        { status: 400 }
      )
    }

    if (existente && existente.status === "BORRADOR") {
      return NextResponse.json(existente, { status: 200 })
    }

    const business = await prisma.business.findUnique({
      where: { id: member.businessId },
      select: { timezone: true },
    })
    const tz = business?.timezone ?? DEFAULT_TZ

    const { inicio, fin } = resolverVentanaTurno(
      datos.shiftDate,
      tz,
      datos.shiftStartTime,
      datos.shiftEndTime
    )

    const puedeVerTodo = can(permissions, "shiftClose", "viewAll")
    const resumen = await calcularResumenCitas(
      member.businessId,
      inicio,
      fin,
      puedeVerTodo ? null : member.id
    )

    const cierre = await prisma.shiftClose.create({
      data: {
        businessId: member.businessId,
        closedById: member.id,
        shiftDate: new Date(datos.shiftDate),
        shiftPeriod: datos.shiftPeriod ?? null,
        shiftStartTime: datos.shiftStartTime ? new Date(datos.shiftStartTime) : null,
        shiftEndTime: datos.shiftEndTime ? new Date(datos.shiftEndTime) : null,
        status: "BORRADOR",
        appointmentsTotal: resumen.appointmentsTotal,
        appointmentsCompleted: resumen.appointmentsCompleted,
        appointmentsCancelled: resumen.appointmentsCancelled,
        appointmentsNoShow: resumen.appointmentsNoShow,
        appointmentsPending: resumen.appointmentsPending,
        expectedRevenue: resumen.expectedRevenue,
      },
    })

    return NextResponse.json(cierre, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", detalles: error.errors },
        { status: 400 }
      )
    }
    console.error("Error creando cierre de turno:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
