import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { actorDeSesion, whereDeClientes } from "@/lib/permisos"

const clienteSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional().or(z.literal("")),
})

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const busqueda = searchParams.get("q") ?? ""
  const etiqueta = searchParams.get("tag") ?? ""
  const pagina = Math.max(1, parseInt(searchParams.get("pagina") ?? "1"))
  const limite = Math.min(50, parseInt(searchParams.get("limite") ?? "20"))
  const skip = (pagina - 1) * limite

  const where = whereDeClientes(actor, {
    ...(busqueda && {
      OR: [
        { name: { contains: busqueda, mode: "insensitive" as const } },
        { email: { contains: busqueda, mode: "insensitive" as const } },
        { phone: { contains: busqueda, mode: "insensitive" as const } },
      ],
    }),
    ...(etiqueta && { tags: { has: etiqueta } }),
  })

  const [clientes, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        tags: true,
        notes: true,
        createdAt: true,
        appointments: {
          orderBy: { startTime: "desc" },
          take: 5,
          select: {
            id: true,
            title: true,
            startTime: true,
            endTime: true,
            status: true,
            price: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limite,
      skip,
    }),
    prisma.customer.count({ where }),
  ])

  return NextResponse.json({
    clientes,
    total,
    pagina,
    paginas: Math.ceil(total / limite),
  })
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const datos = clienteSchema.parse(body)

    const cliente = await prisma.customer.create({
      data: {
        name: datos.name,
        email: datos.email || null,
        phone: datos.phone || null,
        tags: datos.tags ?? [],
        notes: datos.notes || null,
        businessId: actor.businessId,
      },
    })

    return NextResponse.json(cliente, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Datos inválidos", detalles: error.errors },
        { status: 400 }
      )
    }
    console.error("Error creando cliente:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
