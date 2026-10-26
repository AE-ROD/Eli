import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { emailOVacio, etiquetas, nombre, notas, telefono } from "@/lib/campos-del-panel"
import { respuestaDeDatosInvalidos } from "@/lib/respuesta-de-validacion"
import { clienteNoEliminado, datosDeClienteEliminado } from "@/lib/clientes-eliminados"
import {
  actorDeSesion,
  puedeBorrarCliente,
  puedeEditarDatosDeCliente,
  whereDeAgenda,
  whereDeClientes,
  type Actor,
} from "@/lib/permisos"

const edicionDeClienteSchema = z.object({
  name: nombre().optional(),
  email: emailOVacio().optional(),
  phone: telefono().optional(),
  tags: etiquetas().optional(),
  notes: notas().optional(),
})

/**
 * El cliente del negocio con ese id, si no se eliminó. Uno eliminado responde
 * como uno que no existe: no se lee, no se edita (editarlo le devolvería un
 * nombre) y no se vuelve a eliminar.
 */
const delNegocioYVigente = (actor: Actor, id: string) => whereDeClientes(actor, { AND: [{ id }, clienteNoEliminado] })

/**
 * Pide un `Actor`, no `Actor | null`, como `verificarCita` en
 * `app/api/citas/[id]/route.ts`: sin sesión no hay cliente, y el handler ya
 * cortó con 401. Así el compilador obliga a poner la guarda primero.
 */
async function verificarCliente(actor: Actor, id: string) {
  return prisma.customer.findFirst({ where: delNegocioYVigente(actor, id), select: { id: true } })
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
    where: delNegocioYVigente(actor, id),
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
    const cuerpo = await request.json()
    const datos = edicionDeClienteSchema.parse(cuerpo)

    // Las notas las escribe cualquiera; el resto de los datos, sólo dueño y
    // encargado. Se mira lo que quedó del esquema: una clave que no conoce
    // (`businessId`) ya se descartó y no llega a la base.
    const tocaDatos = Object.keys(datos).some((campo) => campo !== "notes")
    if (tocaDatos && !puedeEditarDatosDeCliente(actor)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

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
      return respuestaDeDatosInvalidos(error)
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

  // Después de verificar que es del negocio: para un cliente ajeno, 404.
  if (!puedeBorrarCliente(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  // Eliminar es anonimizar (decisión del dueño, PRODUCTO.md, sección 10): se
  // borran los datos personales y la fila queda, con sus citas y sus
  // atenciones, para que la agenda y los reportes no cambien. Es una sola
  // escritura: no queda un cliente a medio borrar. Por `existente.id`, por lo
  // mismo que en el PUT.
  await prisma.customer.update({ where: { id: existente.id }, data: datosDeClienteEliminado(), select: { id: true } })

  return NextResponse.json({ mensaje: "Cliente eliminado" })
}
