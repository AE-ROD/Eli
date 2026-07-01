import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import bcrypt from "bcryptjs"
import { restablecerPasswordSchema as schema } from "@/lib/validaciones"

// POST /api/auth/restablecer-password — establecer nueva contraseña con el token recibido por email
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token, password } = schema.parse(body)

    const resetToken = await prisma.passwordResetToken.findUnique({ where: { token } })

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      return NextResponse.json({ error: "Enlace inválido o expirado" }, { status: 410 })
    }

    const passwordHash = await bcrypt.hash(password, 12)

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { password: passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ])

    return NextResponse.json({ mensaje: "Contraseña actualizada" })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })
    }
    console.error("Error en restablecer-password:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
