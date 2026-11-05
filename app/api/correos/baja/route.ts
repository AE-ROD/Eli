import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"
import { cuerpoConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import { usuarioDelTokenDeBaja } from "@/lib/baja-de-correos"
import { registrarError } from "@/lib/registro-de-errores"

/**
 * POST /api/correos/baja — `{ token }` del enlace "Dejar de recibir estos
 * correos" (`lib/baja-de-correos.ts`). Apaga los correos del ciclo de prueba
 * del usuario (`User.correosDesactivados`); los de la cuenta (recuperar la
 * contraseña, invitaciones) siguen llegando.
 *
 * Sólo POST, a propósito: los antivirus y las vistas previas de los clientes
 * de correo abren los enlaces con GET, y eso no puede dar de baja a nadie. La
 * página `/baja-de-correos/[token]` pide confirmar con un botón.
 *
 * Responde exactamente lo mismo con un token válido, uno inválido, uno de un
 * usuario que ya no existe o sin cuerpo: no sirve para averiguar nada.
 *
 * Público y sin sesión: lleva su propio límite por IP (el de `auth`, que falla
 * cerrado) y está fuera del límite genérico del panel en `proxy.ts`.
 */

const RESPUESTA = { mensaje: "Listo. No te vamos a mandar más estos correos." }

export async function POST(request: NextRequest) {
  const { permitido } = await verificarLimite("auth", `baja-de-correos:${obtenerIp(request)}`)
  if (!permitido) {
    return NextResponse.json({ error: "Demasiados intentos, intenta más tarde" }, { status: 429 })
  }

  const recibido = await cuerpoConTope(request)
  if (recibido.excedido) return respuestaDeCuerpoDemasiadoGrande()
  const cuerpo = recibido.cuerpo
  const token = typeof cuerpo === "object" && cuerpo !== null ? (cuerpo as { token?: unknown }).token : undefined
  const userId = usuarioDelTokenDeBaja(token)

  if (userId) {
    try {
      // `updateMany` y no `update`: un usuario borrado no lanza, y la respuesta es la misma.
      await prisma.user.updateMany({ where: { id: userId }, data: { correosDesactivados: true } })
    } catch (error) {
      registrarError("dando de baja los correos", error)
      return NextResponse.json({ error: "No se pudo completar, intenta de nuevo" }, { status: 500 })
    }
  }

  return NextResponse.json(RESPUESTA)
}
