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

  const conversaciones = await prisma.conversation.findMany({
    where: { businessId: session.user.businessId },
    select: {
      id: true,
      patientName: true,
      patientPhone: true,
      updatedAt: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, content: true, fromBusiness: true, createdAt: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  })

  return NextResponse.json(conversaciones)
}

const nuevaConvSchema = z.object({
  patientName: z.string().min(2),
  patientPhone: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const datos = nuevaConvSchema.parse(body)

    const conversacion = await prisma.conversation.create({
      data: {
        patientName: datos.patientName,
        patientPhone: datos.patientPhone ?? null,
        businessId: session.user.businessId,
      },
      select: {
        id: true,
        patientName: true,
        patientPhone: true,
        updatedAt: true,
        messages: { select: { id: true, content: true, fromBusiness: true, createdAt: true } },
      },
    })

    return NextResponse.json(conversacion, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", detalles: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
