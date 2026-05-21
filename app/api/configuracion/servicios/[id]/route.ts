import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const servicioUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional().nullable(),
  duration: z.number().min(15).max(480).optional(),
  price: z.number().min(0).optional().nullable(),
  active: z.boolean().optional(),
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params

  const existente = await prisma.service.findFirst({
    where: { id, businessId: session.user.businessId },
  })
  if (!existente) {
    return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 })
  }

  try {
    const body = await request.json()
    const datos = servicioUpdateSchema.parse(body)

    const servicio = await prisma.service.update({
      where: { id },
      data: datos,
    })

    return NextResponse.json(servicio)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", detalles: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params

  const existente = await prisma.service.findFirst({
    where: { id, businessId: session.user.businessId },
  })
  if (!existente) {
    return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 })
  }

  await prisma.service.delete({ where: { id } })

  return NextResponse.json({ mensaje: "Servicio eliminado" })
}
