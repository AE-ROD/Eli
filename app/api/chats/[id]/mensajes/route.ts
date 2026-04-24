import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const mensajeSchema = z.object({
  content: z.string().min(1),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params

  const conversacion = await prisma.conversation.findFirst({
    where: { id, businessId: session.user.businessId },
  })

  if (!conversacion) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 })
  }

  try {
    const body = await request.json()
    const { content } = mensajeSchema.parse(body)

    const [mensaje] = await prisma.$transaction([
      prisma.message.create({
        data: { content, fromBusiness: true, conversationId: id },
        select: { id: true, content: true, fromBusiness: true, createdAt: true },
      }),
      prisma.conversation.update({
        where: { id },
        data: { updatedAt: new Date() },
      }),
    ])

    return NextResponse.json(mensaje, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })
    }
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
