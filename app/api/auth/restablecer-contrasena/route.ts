import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import bcrypt from "bcryptjs"
import { restablecerContrasenaSchema as schema } from "@/lib/validaciones"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"
import type { Prisma } from "@prisma/client"
import { hashDeToken } from "@/lib/tokens"

const ENLACE_INVALIDO = () => NextResponse.json({ error: "Enlace inválido o expirado" }, { status: 410 })

// POST /api/auth/restablecer-contrasena — establecer nueva contraseña con el token recibido por email
export async function POST(request: NextRequest) {
  // Sin tope, el token del enlace se puede adivinar a fuerza de intentos y
  // este endpoint fija la contraseña de la cuenta que ese token identifique.
  const { permitido } = await verificarLimite("auth", obtenerIp(request))
  if (!permitido) {
    return NextResponse.json({ error: "Demasiados intentos, intenta más tarde" }, { status: 429 })
  }

  try {
    const cuerpo = await request.json()
    const { token, contrasena } = schema.parse(cuerpo)

    // La base guarda el hash (lib/tokens.ts): se busca por el hash del enlace.
    const resetToken = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashDeToken(token) } })

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      return ENLACE_INVALIDO()
    }

    const passwordHash = await bcrypt.hash(contrasena, 12)

    // Leer el token y después marcarlo dejaba que dos pedidos simultáneos
    // pasaran los dos la verificación de arriba. Lo que decide es este
    // `updateMany`: en Postgres, el segundo espera el bloqueo de la fila,
    // vuelve a evaluar `usedAt: null` y no marca nada.
    const usado = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const ahora = new Date()
      const marcado = await tx.passwordResetToken.updateMany({
        where: { id: resetToken.id, usedAt: null, expiresAt: { gt: ahora } },
        data: { usedAt: ahora },
      })
      if (marcado.count !== 1) return false

      // Los demás enlaces pendientes del usuario ya no sirven: si alguien más
      // tenía uno, no puede volver a cambiar la contraseña.
      await tx.passwordResetToken.updateMany({
        where: { userId: resetToken.userId, usedAt: null },
        data: { usedAt: ahora },
      })

      // Cierra las sesiones abiertas antes de ahora (lib/auth.ts las revisa
      // cada 5 minutos): quien tenía la contraseña vieja deja de entrar.
      await tx.user.update({
        where: { id: resetToken.userId },
        data: { password: passwordHash, sesionesValidasDesde: ahora },
      })
      return true
    })

    if (!usado) return ENLACE_INVALIDO()

    return NextResponse.json({ mensaje: "Contraseña actualizada" })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })
    }
    console.error("Error en restablecer-contrasena:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
