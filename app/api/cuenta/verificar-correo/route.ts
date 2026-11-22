import { NextRequest, NextResponse, after } from "next/server"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"
import { cuerpoConTope, respuestaDeCuerpoDemasiadoGrande } from "@/lib/cuerpo-del-pedido"
import { registrarError } from "@/lib/registro-de-errores"
import { confirmarCorreo, enviarBienvenidaAlConfirmar } from "@/lib/verificacion-de-correo-servidor"

/**
 * POST /api/cuenta/verificar-correo — `{ token }` del enlace "Confirma tu
 * correo". Marca la cuenta dueña del token como confirmada, borra el token (un
 * enlace sirve una vez) y, si es dueña de un negocio al que todavía no se le
 * mandó, dispara la bienvenida del ciclo de prueba.
 *
 * Sólo POST, a propósito: los antivirus y las vistas previas de los clientes
 * de correo abren los enlaces con GET, y eso no puede gastar el enlace. La
 * página `/verificar-correo/[token]` pide confirmar con un botón.
 *
 * Público y sin sesión (quien abre el correo en el celular no tiene por qué
 * tener la sesión ahí): la cuenta sale del token, nunca de la sesión ni del
 * cuerpo. Enlace inexistente, vencido o ya usado responden el mismo 410.
 *
 * Límite propio por IP (el de `auth`, que falla cerrado): sin tope el token se
 * podría buscar a fuerza de intentos. Además lleva el genérico del panel de
 * `proxy.ts`.
 */

const ENLACE_INVALIDO = () =>
  NextResponse.json({ error: "Este enlace ya no sirve: venció o ya se usó." }, { status: 410 })

export async function POST(request: NextRequest) {
  const { permitido } = await verificarLimite("auth", `verificar-correo:${obtenerIp(request)}`)
  if (!permitido) {
    return NextResponse.json({ error: "Demasiados intentos, intenta más tarde" }, { status: 429 })
  }

  const recibido = await cuerpoConTope(request)
  if (recibido.excedido) return respuestaDeCuerpoDemasiadoGrande()
  const cuerpo = recibido.cuerpo
  const token = typeof cuerpo === "object" && cuerpo !== null ? (cuerpo as { token?: unknown }).token : undefined

  try {
    const confirmada = await confirmarCorreo(token)
    if (!confirmada) return ENLACE_INVALIDO()

    // Después de responder: confirmar no espera al correo.
    after(() => enviarBienvenidaAlConfirmar(confirmada.userId))

    return NextResponse.json({ ok: true })
  } catch (error) {
    registrarError("confirmando el correo", error)
    return NextResponse.json({ error: "No se pudo confirmar tu correo, intenta de nuevo" }, { status: 500 })
  }
}
