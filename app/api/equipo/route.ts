import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { enviarInvitacionTrabajador } from "@/lib/email"
import { actorDeSesion, puedeGestionarEquipo } from "@/lib/permisos"

// GET /api/equipo — lista de miembros del negocio
export async function GET() {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)

  if (!actor || !puedeGestionarEquipo(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const [miembros, invitaciones] = await Promise.all([
    prisma.businessMember.findMany({
      where: { businessId: actor.businessId },
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 200,
    }),
    prisma.workerInvitation.findMany({
      where: { businessId: actor.businessId, acceptedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  ])

  return NextResponse.json({ miembros, invitaciones })
}

const invitarSchema = z.object({
  nombre: z.string().min(2),
  email: z.string().email(),
  rol: z.enum(["worker", "admin"]).default("worker"),
})

// POST /api/equipo — invitar trabajador
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const actor = actorDeSesion(session)

  if (!actor || !puedeGestionarEquipo(actor)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { nombre, email, rol } = invitarSchema.parse(body)

    // Los correos se comparan sin distinguir mayúsculas: para el servidor de
    // correo `Ana@x.com` y `ana@x.com` son la misma casilla, y si acá se
    // trataran como distintas se podría invitar N veces a la misma persona.
    const mismoEmail = { equals: email, mode: "insensitive" as const }

    const yaExiste = await prisma.user.findFirst({
      where: { email: mismoEmail },
      include: { memberships: { where: { businessId: actor.businessId } } },
    })
    if (yaExiste?.memberships.length) {
      return NextResponse.json({ error: "Este usuario ya es miembro del negocio" }, { status: 409 })
    }

    const invitacionPendiente = await prisma.workerInvitation.findFirst({
      where: { businessId: actor.businessId, email: mismoEmail, acceptedAt: null },
    })
    if (invitacionPendiente) {
      return NextResponse.json({ error: "Ya existe una invitación pendiente para este correo" }, { status: 409 })
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 días

    const invitacion = await prisma.workerInvitation.create({
      data: {
        businessId: actor.businessId,
        email,
        name: nombre,
        role: rol,
        expiresAt,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        expiresAt: true,
        createdAt: true,
        token: true, // usado solo para armar el enlace del correo, no se responde al cliente
      },
    })

    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
    const enlaceAceptar = `${baseUrl}/unirse/${invitacion.token}`

    const negocio = await prisma.business.findUnique({
      where: { id: actor.businessId },
      select: { name: true },
    })

    await enviarInvitacionTrabajador({
      emailTrabajador: email,
      nombreTrabajador: nombre,
      nombreNegocio: negocio?.name ?? session?.user.businessName ?? "",
      rol,
      enlaceAceptar,
    }).catch(() => null)

    const { token: _token, ...invitacionSinToken } = invitacion

    return NextResponse.json({ invitacion: invitacionSinToken }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })
    }
    console.error(error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
