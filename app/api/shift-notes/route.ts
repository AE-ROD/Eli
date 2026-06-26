import { NextRequest, NextResponse } from "next/server"
import { toZonedTime } from "date-fns-tz"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { checkPermission, can } from "@/lib/permissions"
import { enviarNotificacionNotaUrgente } from "@/lib/email"

const DEFAULT_TZ = "America/Cancun"

const TIPOS_VALIDOS = ["INCIDENTE", "OBSERVACION", "PENDIENTE", "TRANSFERENCIA", "RECORDATORIO"] as const
const PRIORIDADES_VALIDAS = ["NORMAL", "ALTA", "URGENTE"] as const
const ESTADOS_VALIDOS = ["ACTIVA", "EN_PROGRESO", "RESUELTA", "TRANSFERIDA", "ARCHIVADA"] as const

const crearNotaSchema = z.object({
  type: z.enum(TIPOS_VALIDOS),
  priority: z.enum(PRIORIDADES_VALIDAS).optional().default("NORMAL"),
  title: z.string().min(3).max(120),
  content: z.string().min(10).max(2000),
  tags: z.array(z.string()).optional().default([]),
  shiftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)"),
  shiftPeriod: z.string().optional(),
  assignedTo: z.string().optional(),
})

function obtenerFechaHoyEnTZ(tz: string): string {
  const ahoraLocal = toZonedTime(new Date(), tz)
  return ahoraLocal.toISOString().slice(0, 10)
}

// GET /api/shift-notes — lista de notas de turno con filtros
export async function GET(request: NextRequest) {
  const acceso = await checkPermission("shiftNotes", "view")
  if (!acceso) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const { member, permissions } = acceso

  const negocio = await prisma.business.findUnique({
    where: { id: member.businessId },
    select: { timezone: true },
  })
  const tz = negocio?.timezone ?? DEFAULT_TZ

  const { searchParams } = new URL(request.url)
  let fecha = searchParams.get("date") ?? undefined
  const status = searchParams.get("status")
  const type = searchParams.get("type")
  const priority = searchParams.get("priority")
  const assignedTo = searchParams.get("assignedTo")
  const pagina = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
  const limite = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50")))
  const skip = (pagina - 1) * limite

  // Si el miembro no puede ver historial, se fuerza la fecha de hoy (tz del negocio) ignorando el param
  if (!can(permissions, "shiftNotes", "viewHistory")) {
    fecha = obtenerFechaHoyEnTZ(tz)
  }

  const where: Record<string, unknown> = {
    businessId: member.businessId,
  }

  if (fecha) {
    const inicio = new Date(`${fecha}T00:00:00.000Z`)
    const fin = new Date(`${fecha}T23:59:59.999Z`)
    where.shiftDate = { gte: inicio, lte: fin }
  }

  if (status && (ESTADOS_VALIDOS as readonly string[]).includes(status)) {
    where.status = status
  }
  if (type && (TIPOS_VALIDOS as readonly string[]).includes(type)) {
    where.type = type
  }
  if (priority && (PRIORIDADES_VALIDAS as readonly string[]).includes(priority)) {
    where.priority = priority
  }
  if (assignedTo) {
    where.assignedTo = assignedTo
  }

  const [notas, total] = await Promise.all([
    prisma.shiftNote.findMany({
      where,
      include: {
        author: { select: { id: true, role: true, user: { select: { id: true, name: true } } } },
        assignee: { select: { id: true, role: true, user: { select: { id: true, name: true } } } },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: limite,
      skip,
    }),
    prisma.shiftNote.count({ where }),
  ])

  return NextResponse.json({
    notas,
    total,
    pagina,
    paginas: Math.ceil(total / limite) || 1,
  })
}

// POST /api/shift-notes — crear nota de turno
export async function POST(request: NextRequest) {
  const acceso = await checkPermission("shiftNotes", "create")
  if (!acceso) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }
  const { member } = acceso

  try {
    const body = await request.json()
    const datos = crearNotaSchema.parse(body)

    if (datos.assignedTo) {
      const asignado = await prisma.businessMember.findFirst({
        where: { id: datos.assignedTo, businessId: member.businessId },
      })
      if (!asignado) {
        return NextResponse.json({ error: "El miembro asignado no pertenece a este negocio" }, { status: 400 })
      }
    }

    const nota = await prisma.shiftNote.create({
      data: {
        businessId: member.businessId,
        authorId: member.id,
        assignedTo: datos.assignedTo || null,
        type: datos.type,
        priority: datos.priority,
        title: datos.title,
        content: datos.content,
        tags: datos.tags,
        shiftDate: new Date(`${datos.shiftDate}T00:00:00.000Z`),
        shiftPeriod: datos.shiftPeriod || null,
      },
      include: {
        author: { select: { id: true, role: true, user: { select: { id: true, name: true } } } },
        assignee: { select: { id: true, role: true, user: { select: { id: true, name: true } } } },
      },
    })

    if (nota.priority === "URGENTE") {
      try {
        const destinatarios = await prisma.businessMember.findMany({
          where: {
            businessId: member.businessId,
            role: { in: ["owner", "admin", "manager"] },
          },
          select: { user: { select: { email: true, name: true } } },
        })

        const negocio = await prisma.business.findUnique({
          where: { id: member.businessId },
          select: { name: true },
        })

        const autorNombre = nota.author.user.name

        await Promise.all(
          destinatarios
            .filter((d) => !!d.user.email)
            .map((d) =>
              enviarNotificacionNotaUrgente({
                emailDestinatario: d.user.email!,
                nombreDestinatario: d.user.name,
                nombreNegocio: negocio?.name ?? "tu negocio",
                nombreAutor: autorNombre,
                titulo: nota.title,
                contenido: nota.content,
              })
            )
        )
      } catch (error) {
        console.error("Error enviando notificación de nota urgente:", error)
      }
    }

    return NextResponse.json(nota, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos", detalles: error.errors }, { status: 400 })
    }
    console.error("Error creando nota de turno:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
