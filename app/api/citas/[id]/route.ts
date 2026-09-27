import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { actorDeSesion, whereDeAgenda, type Actor } from "@/lib/permisos"

const citaUpdateSchema = z.object({
  title: z.string().min(2).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  status: z.enum(["pendiente", "confirmada", "en-progreso", "completada", "cancelada"]).optional(),
  notes: z.string().optional().or(z.literal("")),
  price: z.number().positive().optional(),
})

/**
 * Pide un `Actor`, no `Actor | null`: sin sesión no hay cita, y el handler ya
 * cortó con 401 antes de llegar acá (misma convención que `memberIdParaCita`
 * en `lib/permisos.ts`). Así el compilador es el que obliga a poner la guarda
 * primero, en vez de convertir "no hay sesión" en un 404 silencioso.
 */
async function verificarCita(actor: Actor, id: string) {
  return prisma.appointment.findFirst({ where: whereDeAgenda(actor, { id }) })
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
  const cita = await prisma.appointment.findFirst({
    where: whereDeAgenda(actor, { id }),
    include: {
      patient: { select: { id: true, name: true, email: true, phone: true } },
    },
  })

  if (!cita) {
    return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 })
  }

  return NextResponse.json(cita)
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
  const existente = await verificarCita(actor, id)
  if (!existente) {
    return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 })
  }

  try {
    const body = await request.json()
    const datos = citaUpdateSchema.parse(body)

    // Por `existente.id`, no por `id`: si alguien borra la verificación de
    // arriba, `existente` queda sin declarar y el build falla. La garantía deja
    // de depender de que el próximo lea las dos líneas en orden.
    const cita = await prisma.appointment.update({
      where: { id: existente.id },
      data: {
        ...(datos.title && { title: datos.title }),
        ...(datos.startTime && { startTime: new Date(datos.startTime) }),
        ...(datos.endTime && { endTime: new Date(datos.endTime) }),
        ...(datos.status && { status: datos.status }),
        ...(datos.notes !== undefined && { notes: datos.notes || null }),
        ...(datos.price !== undefined && { price: datos.price }),
      },
      include: {
        patient: { select: { id: true, name: true, email: true, phone: true } },
      },
    })

    return NextResponse.json(cita)
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
  const existente = await verificarCita(actor, id)
  if (!existente) {
    return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 })
  }

  await prisma.appointment.delete({ where: { id: existente.id } })

  return NextResponse.json({ mensaje: "Cita eliminada" })
}
