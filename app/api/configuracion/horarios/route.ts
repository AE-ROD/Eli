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

  const horarios = await prisma.workSchedule.findMany({
    where: { businessId: session.user.businessId },
    orderBy: { dayOfWeek: "asc" },
  })

  return NextResponse.json(horarios)
}

const horarioSchema = z.array(
  z.object({
    dayOfWeek: z.number().min(0).max(6),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    active: z.boolean(),
  })
)

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const horarios = horarioSchema.parse(body)
    const businessId = session.user.businessId

    // Reemplaza toda la configuración semanal de una vez
    await prisma.$transaction([
      prisma.workSchedule.deleteMany({ where: { businessId } }),
      prisma.workSchedule.createMany({
        data: horarios.map((h) => ({ ...h, businessId })),
      }),
    ])

    const resultado = await prisma.workSchedule.findMany({
      where: { businessId },
      orderBy: { dayOfWeek: "asc" },
    })

    return NextResponse.json(resultado)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", detalles: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
