import { NextRequest, NextResponse } from "next/server"
import { salirDeLaLista } from "@/lib/lista-de-espera"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"
import { registrarError } from "@/lib/registro-de-errores"

/**
 * POST /api/reservar/[slug]/lista-de-espera/[token] — "Salir de la lista de
 * espera" (#74). Lo llaman:
 * - el botón de la página `/reservar/[slug]/espera/[token]`, y
 * - Gmail y Apple, con la baja en un clic (RFC 8058): un POST con el cuerpo
 *   fijo `List-Unsubscribe=One-Click` a la URL del encabezado
 *   `List-Unsubscribe` del aviso. Por eso el token va en la ruta y el cuerpo
 *   no se lee.
 *
 * Sólo POST: los antivirus y las vistas previas abren los enlaces con GET, y
 * eso no puede sacar a nadie. Responde exactamente lo mismo con un token
 * válido, uno inválido o uno ya usado: no sirve para averiguar nada.
 *
 * Público y sin sesión: límite propio por IP (`bajaPorToken`, falla cerrado).
 */

const RESPUESTA = { mensaje: "Listo. Ya no estás en la lista de espera." }

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string; token: string }> }) {
  const { permitido } = await verificarLimite("bajaPorToken", `lista-de-espera:${obtenerIp(request)}`)
  if (!permitido) {
    return NextResponse.json({ error: "Demasiados intentos, intenta más tarde" }, { status: 429 })
  }

  const { slug, token } = await params
  try {
    await salirDeLaLista(slug, token)
  } catch (error) {
    registrarError("sacando a alguien de la lista de espera", error)
    return NextResponse.json({ error: "No se pudo completar, intenta de nuevo" }, { status: 500 })
  }
  return NextResponse.json(RESPUESTA)
}
