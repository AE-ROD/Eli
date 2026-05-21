import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import bcrypt from "bcryptjs"

const schema = z.object({
  password: z.string().min(8),
})

// POST /api/equipo/invitacion/[token]/aceptar — crear cuenta y unirse al negocio
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
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

    const hashedPassword = await bcrypt.hash(password, 12)

    // Usar transacción: crear usuario (o buscar existente) + crear membership + marcar invitación aceptada
    const resultado = await prisma.$transaction(async (tx) => {
      // Si ya existe el usuario con ese email, solo agregar como miembro
      let usuario = await tx.user.findUnique({ where: { email: invitacion.email } })

      if (!usuario) {
        usuario = await tx.user.create({
          data: {
            name: invitacion.name,
            email: invitacion.email,
            password: hashedPassword,
          },
        })
      } else {
        // Si ya existe (p.ej. cuenta Google con password vacío), actualizar password
        // para que pueda iniciar sesión con credenciales
        await tx.user.update({
          where: { id: usuario.id },
          data: { name: invitacion.name, password: hashedPassword },
        })
      }

      // Verificar que no sea ya miembro
      const yaEsMiembro = await tx.businessMember.findUnique({
        where: { businessId_userId: { businessId: invitacion.businessId, userId: usuario.id } },
      })

      if (!yaEsMiembro) {
        await tx.businessMember.create({
          data: {
            businessId: invitacion.businessId,
            userId: usuario.id,
            role: invitacion.role,
          },
        })
      }

      await tx.workerInvitation.update({
        where: { id: invitacion.id },
        data: { acceptedAt: new Date() },
      })

      return usuario
    })

    return NextResponse.json({ ok: true, email: resultado.email })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })
    }
    console.error(error)
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
