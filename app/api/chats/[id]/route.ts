import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params

  const conversacion = await prisma.conversation.findFirst({
    where: { id, businessId: session.user.businessId },
    select: {
      id: true,
      patientName: true,
      patientPhone: true,
      updatedAt: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: { id: true, content: true, fromBusiness: true, createdAt: true },
      },
    },
  })

  if (!conversacion) {
    return NextResponse.json({ error: "Conversación no encontrada" }, { status: 404 })
  }

  return NextResponse.json(conversacion)
}
