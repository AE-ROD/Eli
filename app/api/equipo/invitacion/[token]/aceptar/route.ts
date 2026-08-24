import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import { z } from "zod"
import bcrypt from "bcryptjs"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"

const schema = z.object({
  password: z.string().min(8).optional(),
})

// POST /api/equipo/invitacion/[token]/aceptar — crear cuenta y unirse al negocio
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { permitido } = await verificarLimite("auth", obtenerIp(request))
  if (!permitido) {
    return NextResponse.json({ error: "Demasiados intentos, intenta más tarde" }, { status: 429 })
  }

  const { token } = await params

  const invitacion = await prisma.workerInvitation.findUnique({
    where: { token },
    include: { business: true },
  })

  if (!invitacion || invitacion.acceptedAt || invitacion.expiresAt < new Date()) {
    return NextResponse.json({ error: "Invitación inválida o expirada" }, { status: 410 })
  }

  try {
    const body = await request.json()
    const { password } = schema.parse(body)

    // Una invitación no crea ni pisa credenciales de una cuenta que ya existe:
    // ese caso solo puede sumar la membresía, y solo si quien acepta ya
    // demostró ser dueño del correo iniciando sesión con él.
    const usuarioExistente = await prisma.user.findUnique({ where: { email: invitacion.email } })

    if (usuarioExistente) {
      const session = await getServerSession(authOptions)
      const emailSesion = session?.user?.email

      if (!emailSesion || emailSesion.toLowerCase() !== invitacion.email.toLowerCase()) {
        return NextResponse.json(
          {
            error: "Iniciá sesión con ese correo para aceptar la invitación",
            requiereSesion: true,
          },
          { status: 401 }
        )
      }

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const yaEsMiembro = await tx.businessMember.findUnique({
          where: { businessId_userId: { businessId: invitacion.businessId, userId: usuarioExistente.id } },
        })

        if (!yaEsMiembro) {
          await tx.businessMember.create({
            data: {
              businessId: invitacion.businessId,
              userId: usuarioExistente.id,
              role: invitacion.role,
            },
          })
        }

        await tx.workerInvitation.update({
          where: { id: invitacion.id },
          data: { acceptedAt: new Date() },
        })
      })

      return NextResponse.json({ ok: true, email: usuarioExistente.email, cuentaNueva: false })
    }

    if (!password) {
      return NextResponse.json({ error: "La contraseña es requerida" }, { status: 400 })
    }

    const hashedPassword = await bcrypt.hash(password, 12)

    // Usar transacción: crear usuario + crear membership + marcar invitación aceptada
    const resultado = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const usuario = await tx.user.create({
        data: {
          name: invitacion.name,
          email: invitacion.email,
          password: hashedPassword,
        },
      })

      await tx.businessMember.create({
        data: {
          businessId: invitacion.businessId,
          userId: usuario.id,
          role: invitacion.role,
        },
      })

      await tx.workerInvitation.update({
        where: { id: invitacion.id },
        data: { acceptedAt: new Date() },
      })

      return usuario
    })

    return NextResponse.json({ ok: true, email: resultado.email, cuentaNueva: true })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })
    }
    console.error(error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
