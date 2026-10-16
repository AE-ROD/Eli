import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { actorDeSesion, whereDeAgenda, whereDeClientes, type Actor } from "@/lib/permisos"

const clienteUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional().or(z.literal("")),
})

/**
 * Pide un `Actor`, no `Actor | null`, como `verificarCita` en
 * `app/api/citas/[id]/route.ts`: sin sesión no hay cliente, y el handler ya
 * cortó con 401. Así el compilador obliga a poner la guarda primero.
 */
async function verificarCliente(actor: Actor, id: string) {
  return prisma.customer.findFirst({ where: whereDeClientes(actor, { id }), select: { id: true } })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params
  // `select` y no `include`: con `include` las citas venían enteras, con las
  // notas internas y los comentarios del cliente. Del cliente se devuelve lo
  // mismo que antes.
  const cliente = await prisma.customer.findFirst({
    where: whereDeClientes(actor, { id }),
    select: {
      id: true,
      name: true,
      lastName: true,
      cedula: true,
      email: true,
      phone: true,
      tags: true,
      notes: true,
      businessId: true,
      createdAt: true,
      updatedAt: true,
      // El cliente es del negocio, pero sus citas son agenda: el profesional
      // ve sólo las suyas, igual que en el listado.
      appointments: {
        where: whereDeAgenda(actor),
        orderBy: { startTime: "desc" },
        take: 20,
        // Lo que dibuja la vista (`CitaDeCliente`).
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
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params
  const existente = await verificarCliente(actor, id)
  if (!existente) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })
  }

  try {
    const body = await request.json()
    const datos = clienteUpdateSchema.parse(body)

    // Por `existente.id`, no por `id`: si alguien borra la verificación de
    // arriba, `existente` queda sin declarar y el build falla. La garantía deja
    // de depender de que el próximo lea las dos líneas en orden.
    const cliente = await prisma.customer.update({
      where: { id: existente.id },
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
  const actor = actorDeSesion(session)
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const { id } = await params
  const existente = await verificarCliente(actor, id)
  if (!existente) {
    return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 })
  }

  // Por `existente.id`, por lo mismo que en el PUT.
  await prisma.customer.delete({ where: { id: existente.id } })

  return NextResponse.json({ mensaje: "Cliente eliminado" })
}
