import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { actorDeSesion, puedeUsarChats } from "@/lib/permisos"
import { z } from "zod"
import { CuerpoDemasiadoGrande, leerJsonConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"

export async function GET() {
  const actor = actorDeSesion(await getServerSession(authOptions))
  // Escondido hasta WhatsApp: 404 a todos, sin sesión incluida, para no
  // revelar que la ruta existe. Va antes de tocar la base.
  if (!actor || !puedeUsarChats(actor)) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 })
  }

  const conversaciones = await prisma.conversation.findMany({
    where: { businessId: actor.businessId },
    select: {
      id: true,
      customerName: true,
      customerPhone: true,
      updatedAt: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, content: true, fromBusiness: true, createdAt: true },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  })

  return NextResponse.json(conversaciones)
}

const nuevaConversacionSchema = z.object({
  customerName: z.string().min(2),
  customerPhone: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const actor = actorDeSesion(await getServerSession(authOptions))
  // Escondido hasta WhatsApp: 404 a todos, sin sesión incluida, para no
  // revelar que la ruta existe. Va antes de tocar la base.
  if (!actor || !puedeUsarChats(actor)) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 })
  }

  try {
    const cuerpo = await leerJsonConTope(request)
    const datos = nuevaConversacionSchema.parse(cuerpo)

    const conversacion = await prisma.conversation.create({
      data: {
        customerName: datos.customerName,
        customerPhone: datos.customerPhone ?? null,
        businessId: actor.businessId,
      },
      select: {
        id: true,
        customerName: true,
        customerPhone: true,
        updatedAt: true,
        messages: { select: { id: true, content: true, fromBusiness: true, createdAt: true } },
      },
    })

    return NextResponse.json(conversacion, { status: 201 })
  } catch (error) {
    if (error instanceof CuerpoDemasiadoGrande) return respuestaDeCuerpoDemasiadoGrande()
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", detalles: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
