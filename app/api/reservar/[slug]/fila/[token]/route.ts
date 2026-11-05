import { NextRequest, NextResponse } from "next/server"
import { hashDelTokenDeFila, leerMiTurno, salirDeLaFila } from "@/lib/fila-virtual-servidor"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"
import { registrarError } from "@/lib/registro-de-errores"

/**
 * /api/reservar/[slug]/fila/[token] — el turno de una persona en la fila
 * virtual (#85), con el token de su enlace. Público y sin sesión.
 *
 * GET: número, en qué está, cuántas personas van antes y el tiempo estimado.
 * Lo pregunta el celular cada ~20 s. Dos límites que fallan cerrado: por IP
 * (`lecturaPublica`) y por hash del token (`posicionEnFila`), para que un
 * enlace filtrado no se use en bucle. Nunca devuelve datos de otras personas.
 *
 * POST: "Salir de la fila": la atención queda anulada. Sólo mientras espera;
 * si ya la están atendiendo, 409. Límite por IP (`bajaPorToken`).
 *
 * Un token que no es de un turno de ese negocio (de otro negocio, inventado,
 * o con un slug que no existe): 404.
 */

const NO_ENCONTRADO = () => NextResponse.json({ error: "No encontrado" }, { status: 404 })
const DEMASIADAS = () => NextResponse.json({ error: "Demasiadas solicitudes, intenta más tarde" }, { status: 429 })

type Contexto = { params: Promise<{ slug: string; token: string }> }

export async function GET(request: NextRequest, { params }: Contexto) {
  const porIp = await verificarLimite("lecturaPublica", obtenerIp(request))
  if (!porIp.permitido) return DEMASIADAS()

  const { slug, token } = await params
  const hash = hashDelTokenDeFila(token)
  if (!hash) return NO_ENCONTRADO()
  const porToken = await verificarLimite("posicionEnFila", hash)
  if (!porToken.permitido) return DEMASIADAS()

  try {
    const turno = await leerMiTurno(slug, token)
    return turno ? NextResponse.json(turno, { headers: { "Cache-Control": "no-store" } }) : NO_ENCONTRADO()
  } catch (error) {
    registrarError("leyendo un turno de la fila virtual", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: Contexto) {
  const { permitido } = await verificarLimite("bajaPorToken", `fila:${obtenerIp(request)}`)
  if (!permitido) return DEMASIADAS()

  const { slug, token } = await params
  try {
    const resultado = await salirDeLaFila(slug, token)
    if (resultado === "no-encontrado") return NO_ENCONTRADO()
    if (resultado === "ya-no-espera") {
      return NextResponse.json({ error: "Ya te están atendiendo: no se puede salir de la fila." }, { status: 409 })
    }
    return NextResponse.json({ mensaje: "Listo. Saliste de la fila." })
  } catch (error) {
    registrarError("sacando a alguien de la fila virtual", error)
    return NextResponse.json({ error: "No se pudo completar, intenta de nuevo" }, { status: 500 })
  }
}
