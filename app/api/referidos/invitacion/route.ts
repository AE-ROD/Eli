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
 *
 * Como deja una cookie sin pedir sesión, no acepta pedidos que un sitio ajeno
 * pueda mandar desde el navegador de otro: exige `Content-Type:
 * application/json` (un formulario HTML no puede mandarlo sin preflight de
 * CORS) y, si viene `Origin`, que sea el de Eli. En los dos casos responde
 * sin tocar las cookies.
 */
export async function POST(request: NextRequest) {
  const tipo = request.headers.get("content-type") ?? ""
  if (tipo.split(";")[0].trim().toLowerCase() !== "application/json") {
    return NextResponse.json({ error: "Se espera JSON" }, { status: 415 })
  }
  if (!origenPropio(request)) {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 })
  }

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

/**
 * Si el pedido viene de Eli. Sin `Origin` se acepta (no lo mandan todos los
 * clientes, y un navegador sí lo manda en un POST de otro sitio). Con `Origin`,
 * su host tiene que ser el de `NEXTAUTH_URL` o el `Host` del propio pedido.
 */
function origenPropio(request: NextRequest): boolean {
  const origen = request.headers.get("origin")
  if (origen === null) return true

  let hostDelOrigen: string
  try {
    hostDelOrigen = new URL(origen).host
  } catch {
    return false
  }

  const propios = new Set<string>()
  const host = request.headers.get("host")
  if (host) propios.add(host)
  try {
    if (process.env.NEXTAUTH_URL) propios.add(new URL(process.env.NEXTAUTH_URL).host)
  } catch {
    // Un NEXTAUTH_URL mal formado no agrega nada: queda sólo el `Host`.
  }
  return propios.has(hostDelOrigen)
}
