import { NextRequest, NextResponse, after } from "next/server"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { enviarRecuperacionContrasena } from "@/lib/email"
import { recuperarContrasenaSchema as schema } from "@/lib/validaciones"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"
import { generarToken, hashDeToken } from "@/lib/tokens"
import { registrarError } from "@/lib/registro-de-errores"
import { urlBase } from "@/lib/url-base"
import { CuerpoDemasiadoGrande, leerJsonConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"

const MENSAJE_GENERICO = {
  mensaje: "Si existe una cuenta con ese correo, te enviamos un enlace para restablecer tu contraseña.",
}

/**
 * Busca la cuenta y, si tiene contraseña, guarda un enlace nuevo y lo manda.
 * Corre DESPUÉS de responder (`after`): la respuesta es la misma y sale igual
 * de rápido exista o no la cuenta, así que ni el cuerpo ni el tiempo dicen
 * quién está registrado.
 *
 * Antes de todo, el tope por correo de destino (`recuperacionPorCorreo`, en
 * hash): rotando IPs no se le puede llenar la bandeja a nadie. Falla cerrado:
 * si Upstash no responde, no se manda nada.
 */
async function mandarEnlaceSiCorresponde(email: string): Promise<void> {
  try {
    const { permitido } = await verificarLimite("recuperacionPorCorreo", hashDeToken(email))
    if (!permitido) return

    const usuario = await prisma.user.findUnique({ where: { email } })
    // Una cuenta de Google no tiene contraseña que restablecer.
    if (!usuario || !usuario.password) return

    // Antes de guardar nada: sin NEXTAUTH_URL en producción no hay enlace que mandar.
    const baseUrl = urlBase()
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hora

    // A la base va sólo el hash; el token en claro, sólo al enlace del correo.
    const { token, tokenHash } = generarToken()
    await prisma.passwordResetToken.create({
      data: { userId: usuario.id, tokenHash, expiresAt },
      select: { id: true },
    })

    await enviarRecuperacionContrasena({
      emailUsuario: usuario.email,
      nombreUsuario: usuario.name,
      enlaceRestablecer: `${baseUrl}/restablecer-contrasena/${token}`,
    })
  } catch (error) {
    registrarError("mandando el enlace de recuperar contraseña", error)
  }
}

// POST /api/auth/recuperar-contrasena — solicitar enlace de recuperación
export async function POST(request: NextRequest) {
  const { permitido } = await verificarLimite("auth", obtenerIp(request))
  if (!permitido) {
    return NextResponse.json({ error: "Demasiados intentos, intenta más tarde" }, { status: 429 })
  }

  try {
    const cuerpo = await leerJsonConTope(request)
    const { email } = schema.parse(cuerpo)

    // No revelamos si el correo existe o no (evita enumeración de usuarios):
    // la respuesta es siempre ésta, y lo que depende de la cuenta va después.
    after(() => mandarEnlaceSiCorresponde(email))

    return NextResponse.json(MENSAJE_GENERICO)
  } catch (error) {
    if (error instanceof CuerpoDemasiadoGrande) return respuestaDeCuerpoDemasiadoGrande()
    // Un cuerpo que no es JSON (o vacío) es un pedido mal hecho: 400, no 500.
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })
    }
    registrarError("en recuperar-contrasena", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
