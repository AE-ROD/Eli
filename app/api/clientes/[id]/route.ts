import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const clienteUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional().or(z.literal("")),
})

async function verificarCliente(id: string, businessId: string) {
  return prisma.customer.findFirst({ where: { id, businessId } })
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
  const cliente = await prisma.customer.findFirst({
    where: { id, businessId: session.user.businessId },
    include: {
      appointments: {
        orderBy: { startTime: "desc" },
        take: 20,
      },
    },
  })

  if (!cliente) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })
  }

  return NextResponse.json(cliente)
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
  const existente = await verificarCliente(id, session.user.businessId)
  if (!existente) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })
  }

  try {
    const body = await request.json()
    const datos = clienteUpdateSchema.parse(body)

    const cliente = await prisma.customer.update({
      where: { id },
      data: {
        ...(datos.name && { name: datos.name }),
        ...(datos.email !== undefined && { email: datos.email || null }),
        ...(datos.phone !== undefined && { phone: datos.phone || null }),
        ...(datos.tags !== undefined && { tags: datos.tags }),
        ...(datos.notes !== undefined && { notes: datos.notes || null }),
      },
    })

    return NextResponse.json(cliente)
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
  const existente = await verificarCliente(id, session.user.businessId)
  if (!existente) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })
  }

  await prisma.customer.delete({ where: { id } })

  return NextResponse.json({ mensaje: "Cliente eliminado" })
}
