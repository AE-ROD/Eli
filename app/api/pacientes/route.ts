import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const pacienteSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional().or(z.literal("")),
})

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const busqueda = searchParams.get("q") ?? ""
  const etiqueta = searchParams.get("tag") ?? ""

  const pacientes = await prisma.patient.findMany({
    where: {
      businessId: session.user.businessId,
      ...(busqueda && {
        OR: [
          { name: { contains: busqueda, mode: "insensitive" } },
          { email: { contains: busqueda, mode: "insensitive" } },
          { phone: { contains: busqueda, mode: "insensitive" } },
        ],
      }),
      ...(etiqueta && { tags: { has: etiqueta } }),
    },
    include: {
      appointments: {
        orderBy: { startTime: "desc" },
        take: 5,
        include: { patient: { select: { name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json(pacientes)
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.businessId) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const datos = pacienteSchema.parse(body)

    const paciente = await prisma.patient.create({
      data: {
        name: datos.name,
        email: datos.email || null,
        phone: datos.phone || null,
        tags: datos.tags ?? [],
        notes: datos.notes || null,
        businessId: session.user.businessId,
      },
    })

    return NextResponse.json(paciente, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", detalles: error.errors },
        { status: 400 }
      )
    }
    console.error("Error creando paciente:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
