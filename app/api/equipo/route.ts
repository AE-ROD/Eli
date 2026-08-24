import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { enviarInvitacionTrabajador } from "@/lib/email"

// GET /api/equipo — lista de miembros del negocio
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.id || user.role !== "owner") {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const [miembros, invitaciones] = await Promise.all([
    prisma.businessMember.findMany({
      where: { businessId: user.businessId },
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.workerInvitation.findMany({
      where: { businessId: user.businessId, acceptedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
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
  const user = session?.user as any
  if (!user?.id || user.role !== "owner") {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { nombre, email, rol } = invitarSchema.parse(body)

    // Verificar que no exista ya un miembro o invitación pendiente con ese email
    const yaExiste = await prisma.user.findUnique({
      where: { email },
      include: { memberships: { where: { businessId: user.businessId } } },
    })
    if (yaExiste?.memberships.length) {
      return NextResponse.json({ error: "Este usuario ya es miembro del negocio" }, { status: 409 })
    }

    const invitacionPendiente = await prisma.workerInvitation.findFirst({
      where: { businessId: user.businessId, email, acceptedAt: null },
    })
    if (invitacionPendiente) {
      return NextResponse.json({ error: "Ya existe una invitación pendiente para este correo" }, { status: 409 })
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 días

    const invitacion = await prisma.workerInvitation.create({
      data: {
        businessId: user.businessId,
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
      where: { id: user.businessId },
      select: { name: true },
    })

    await enviarInvitacionTrabajador({
      emailTrabajador: email,
      nombreTrabajador: nombre,
      nombreNegocio: negocio?.name ?? user.businessName,
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
