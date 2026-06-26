import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const pacienteUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional().or(z.literal("")),
})

async function verificarPaciente(id: string, businessId: string) {
  return prisma.patient.findFirst({ where: { id, businessId } })
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
  const paciente = await prisma.patient.findFirst({
    where: { id, businessId: session.user.businessId },
    include: {
      appointments: {
        orderBy: { startTime: "desc" },
        take: 50,
        select: {
          id: true,
          title: true,
          startTime: true,
          endTime: true,
          status: true,
          isWalkIn: true,
          price: true,
          paymentMethod: true,
          tipAmount: true,
          notes: true,
          service: { select: { name: true } },
          member: { select: { user: { select: { name: true } } } },
        },
      },
    },
  })

  if (!paciente) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
  }

  return NextResponse.json(paciente)
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
  const existente = await verificarPaciente(id, session.user.businessId)
  if (!existente) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
  }

  try {
    const body = await request.json()
    const datos = pacienteUpdateSchema.parse(body)

    const paciente = await prisma.patient.update({
      where: { id },
      data: {
        ...(datos.name && { name: datos.name }),
        ...(datos.email !== undefined && { email: datos.email || null }),
        ...(datos.phone !== undefined && { phone: datos.phone || null }),
        ...(datos.tags !== undefined && { tags: datos.tags }),
        ...(datos.notes !== undefined && { notes: datos.notes || null }),
      },
    })

    return NextResponse.json(paciente)
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

  const role = (session.user as any).role as string | undefined
  if (!["owner", "admin"].includes(role ?? "")) {
    return NextResponse.json({ error: "Solo administradores pueden eliminar usuarios" }, { status: 403 })
  }

  const { id } = await params
  const existente = await verificarPaciente(id, session.user.businessId)
  if (!existente) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
  }

  await prisma.patient.delete({ where: { id } })

  return NextResponse.json({ mensaje: "Usuario eliminado" })
}
