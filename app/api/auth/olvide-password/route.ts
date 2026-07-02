import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { enviarRecuperacionPassword } from "@/lib/email"
import { olvidePasswordSchema as schema } from "@/lib/validaciones"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"

const MENSAJE_GENERICO = {
  mensaje: "Si existe una cuenta con ese correo, te enviamos un enlace para restablecer tu contraseña.",
}

// POST /api/auth/olvide-password — solicitar enlace de recuperación
export async function POST(request: NextRequest) {
  const { permitido } = await verificarLimite("auth", obtenerIp(request))
  if (!permitido) {
    return NextResponse.json({ error: "Demasiados intentos, intenta más tarde" }, { status: 429 })
  }

  try {
    const body = await request.json()
    const { email } = schema.parse(body)

    const usuario = await prisma.user.findUnique({ where: { email } })

    // No revelamos si el correo existe o no (evita enumeración de usuarios)
    if (!usuario || !usuario.password) {
      return NextResponse.json(MENSAJE_GENERICO)
    }

    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hora

    const resetToken = await prisma.passwordResetToken.create({
      data: { userId: usuario.id, expiresAt },
    })

    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000"
    const enlaceRestablecer = `${baseUrl}/restablecer-contrasena/${resetToken.token}`

    await enviarRecuperacionPassword({
      emailUsuario: usuario.email,
      nombreUsuario: usuario.name,
      enlaceRestablecer,
    }).catch(() => null)

    return NextResponse.json(MENSAJE_GENERICO)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })
    }
    console.error("Error en olvide-password:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
