import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const citaUpdateSchema = z.object({
  title: z.string().min(2).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  status: z.enum(["pendiente", "confirmada", "en-progreso", "completada", "cancelada"]).optional(),
  notes: z.string().optional().or(z.literal("")),
  price: z.number().positive().optional(),
})

async function verificarCita(id: string, businessId: string) {
  return prisma.appointment.findFirst({ where: { id, businessId } })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params
  const cita = await prisma.appointment.findFirst({
    where: { id, businessId: session.user.businessId },
    include: {
      patient: { select: { id: true, name: true, email: true, phone: true } },
    },
  })

  if (!cita) {
    return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 })
  }

  return NextResponse.json(cita)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params
  const existente = await verificarCita(id, session.user.businessId)
  if (!existente) {
    return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 })
  }

  try {
    const body = await request.json()
    const datos = citaUpdateSchema.parse(body)

    const cita = await prisma.appointment.update({
      where: { id },
      data: {
        ...(datos.title && { title: datos.title }),
        ...(datos.startTime && { startTime: new Date(datos.startTime) }),
        ...(datos.endTime && { endTime: new Date(datos.endTime) }),
        ...(datos.status && { status: datos.status }),
        ...(datos.notes !== undefined && { notes: datos.notes || null }),
        ...(datos.price !== undefined && { price: datos.price }),
      },
      include: {
        patient: { select: { id: true, name: true, email: true, phone: true } },
      },
    })

    return NextResponse.json(cita)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", detalles: error.errors },
        { status: 400 }
      )
    }
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params
  const existente = await verificarCita(id, session.user.businessId)
  if (!existente) {
    return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 })
  }

  await prisma.appointment.delete({ where: { id } })

  return NextResponse.json({ mensaje: "Cita eliminada" })
}
