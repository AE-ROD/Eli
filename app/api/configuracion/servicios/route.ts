import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const servicios = await prisma.service.findMany({
    where: { businessId: session.user.businessId },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json(servicios)
}

const servicioSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  duration: z.number().min(15).max(480),
  price: z.number().min(0).optional(),
})

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const datos = servicioSchema.parse(body)

    const servicio = await prisma.service.create({
      data: {
        ...datos,
        price: datos.price ?? null,
        businessId: session.user.businessId,
      },
    })

    return NextResponse.json(servicio, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", detalles: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
