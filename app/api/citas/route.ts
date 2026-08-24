import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { actorDeSesion, memberIdParaCita } from "@/lib/permisos"

const citaSchema = z.object({
  title: z.string().min(2),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  status: z.enum(["pendiente", "confirmada", "en-progreso", "completada", "cancelada"]).optional(),
  notes: z.string().optional().or(z.literal("")),
  price: z.number().positive().optional(),
  patientId: z.string(),
  memberId: z.string().nullable().optional(),
})

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const fecha = searchParams.get("fecha")
  const desde = searchParams.get("desde")
  const hasta = searchParams.get("hasta")
  const patientId = searchParams.get("patientId")

  let fechaInicio: Date | undefined
  let fechaFin: Date | undefined

  if (desde && hasta) {
    fechaInicio = new Date(desde)
    fechaInicio.setHours(0, 0, 0, 0)
    fechaFin = new Date(hasta)
    fechaFin.setHours(23, 59, 59, 999)
  } else if (fecha) {
    fechaInicio = new Date(fecha)
    fechaInicio.setHours(0, 0, 0, 0)
    fechaFin = new Date(fecha)
    fechaFin.setHours(23, 59, 59, 999)
  }

  const citas = await prisma.appointment.findMany({
    where: {
      businessId: session.user.businessId,
      ...(patientId && { patientId }),
      ...(fechaInicio && fechaFin && {
        startTime: { gte: fechaInicio, lte: fechaFin },
      }),
    },
    select: {
      id: true,
      title: true,
      startTime: true,
      endTime: true,
      status: true,
      notes: true,
      price: true,
      patientId: true,
      patient: { select: { id: true, name: true, email: true, phone: true } },
      memberId: true,
      member: { select: { id: true, role: true, user: { select: { id: true, name: true } } } },
    },
    orderBy: { startTime: "asc" },
    take: fechaInicio ? undefined : 100,
  })

  return NextResponse.json(citas)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const datos = citaSchema.parse(body)

    const paciente = await prisma.patient.findFirst({
      where: { id: datos.patientId, businessId: session.user.businessId },
    })

    if (!paciente) {
      return NextResponse.json({ error: "Paciente no encontrado" }, { status: 404 })
    }

    const cita = await prisma.appointment.create({
      data: {
        title: datos.title,
        startTime: new Date(datos.startTime),
        endTime: new Date(datos.endTime),
        status: datos.status ?? "pendiente",
        notes: datos.notes || null,
        price: datos.price ?? null,
        patientId: datos.patientId,
        businessId: session.user.businessId,
      },
      include: {
        patient: { select: { id: true, name: true, email: true, phone: true } },
      },
    })

    return NextResponse.json(cita, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", detalles: error.errors },
        { status: 400 }
      )
    }
    console.error("Error creando cita:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
