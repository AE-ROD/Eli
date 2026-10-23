import { NextRequest, NextResponse } from "next/server"
import { normalizarCodigoInvitacion } from "@/lib/prueba"
import { borrarCookieDeInvitacion, guardarCookieDeInvitacion } from "@/lib/referidos"

/**
 * Guarda el código de un enlace de invitación antes de que crear-cuenta mande
 * a Google. Al volver, el negocio se crea en completar-perfil, que lo lee de
 * la cookie y la borra.
 *
 * No consulta la base ni dice si el código existe: responde 204 siempre. Sólo
 * guarda un código bien formado; con cualquier otra cosa borra la que hubiera.
 * Sin sesión a propósito (todavía no hay cuenta): el proxy le pone el límite
 * genérico por IP, como a todo `/api` que no está en sus excepciones.
 */
export async function POST(request: NextRequest) {
  let codigo: string | null = null
  try {
    const cuerpo = (await request.json()) as { codigo?: unknown } | null
    codigo = normalizarCodigoInvitacion(cuerpo?.codigo)
  } catch {
    codigo = null
  }

  const respuesta = new NextResponse(null, { status: 204 })
  if (codigo) guardarCookieDeInvitacion(respuesta, codigo)
  else borrarCookieDeInvitacion(respuesta)
  return respuesta
}
