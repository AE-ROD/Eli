import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { checkPermission, can } from "@/lib/permissions"

const PRIORIDADES_VALIDAS = ["NORMAL", "ALTA", "URGENTE"] as const
const ESTADOS_VALIDOS = ["ACTIVA", "EN_PROGRESO", "RESUELTA", "TRANSFERIDA", "ARCHIVADA"] as const

const actualizarNotaSchema = z.object({
  title: z.string().min(3).max(120).optional(),
  content: z.string().min(10).max(2000).optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(ESTADOS_VALIDOS).optional(),
  priority: z.enum(PRIORIDADES_VALIDAS).optional(),
  assignedTo: z.string().nullable().optional(),
  resolvedBy: z.string().optional(),
  transferredToDate: z.string().optional(),
})

const incluirRelaciones = {
  author: { select: { id: true, role: true, user: { select: { id: true, name: true } } } },
  assignee: { select: { id: true, role: true, user: { select: { id: true, name: true } } } },
  resolver: { select: { id: true, role: true, user: { select: { id: true, name: true } } } },
} as const

// GET /api/shift-notes/[id]
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await checkPermission("shiftNotes", "view")
  if (!acceso) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const { member } = acceso
  const { id } = await params

  const nota = await prisma.shiftNote.findFirst({
    where: { id, businessId: member.businessId },
    include: incluirRelaciones,
  })

  if (!nota) {
    return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 })
  }

  return NextResponse.json(nota)
}

// PATCH /api/shift-notes/[id]
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await checkPermission("shiftNotes", "edit")
  if (!acceso) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const { member, permissions } = acceso
  const { id } = await params

  const notaExistente = await prisma.shiftNote.findFirst({
    where: { id, businessId: member.businessId },
  })
  if (!notaExistente) {
    return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 })
  }

  const puedeEditarTodas = can(permissions, "shiftNotes", "editAll")
  if (!puedeEditarTodas) {
    const esAutor = notaExistente.authorId === member.id
    const estaActiva = notaExistente.status === "ACTIVA"
    if (!esAutor || !estaActiva) {
      return NextResponse.json({ error: "No tienes permiso para editar esta nota" }, { status: 403 })
    }
  }

  try {
    const body = await request.json()
    const datos = actualizarNotaSchema.parse(body)

    if (datos.assignedTo) {
      const asignado = await prisma.businessMember.findFirst({
        where: { id: datos.assignedTo, businessId: member.businessId },
      })
      if (!asignado) {
        return NextResponse.json({ error: "El miembro asignado no pertenece a este negocio" }, { status: 400 })
      }
    }

    if (datos.status === "TRANSFERIDA" && !datos.transferredToDate) {
      return NextResponse.json(
        { error: "transferredToDate es requerido al transferir una nota" },
        { status: 400 }
      )
    }

    const data: Record<string, unknown> = {}
    if (datos.title !== undefined) data.title = datos.title
    if (datos.content !== undefined) data.content = datos.content
    if (datos.tags !== undefined) data.tags = datos.tags
    if (datos.priority !== undefined) data.priority = datos.priority
    if (datos.assignedTo !== undefined) data.assignedTo = datos.assignedTo
    if (datos.transferredToDate !== undefined) {
      data.transferredToDate = new Date(`${datos.transferredToDate}T00:00:00.000Z`)
    }

    if (datos.status !== undefined) {
      data.status = datos.status
      if (datos.status === "RESUELTA") {
        data.resolvedAt = new Date()
        data.resolvedBy = member.id
      }
    }

    const nota = await prisma.shiftNote.update({
      where: { id },
      data,
      include: incluirRelaciones,
    })

    return NextResponse.json(nota)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", detalles: error.errors }, { status: 400 })
    }
    console.error("Error actualizando nota de turno:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}

// DELETE /api/shift-notes/[id]
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const acceso = await checkPermission("shiftNotes", "delete")
  if (!acceso) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const { member } = acceso
  const { id } = await params

  const notaExistente = await prisma.shiftNote.findFirst({
    where: { id, businessId: member.businessId },
  })
  if (!notaExistente) {
    return NextResponse.json({ error: "Nota no encontrada" }, { status: 404 })
  }

  await prisma.shiftNote.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
