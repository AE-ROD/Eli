import { NextResponse } from "next/server"
import { getToken } from "next-auth/jwt"
import type { NextRequest } from "next/server"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"

/**
 * Prefijos de `/api` que NO llevan el límite genérico del panel: cada uno ya
 * tiene su propio control, más ajustado a su caso (login, registro,
 * recuperar contraseña, invitación por token, reserva pública), o no
 * corresponde uno por sesión porque no hay una persona logueada del otro
 * lado (el cron lo llama Vercel con un secreto).
 *
 * A propósito es una lista de EXCEPCIONES y no de endpoints cubiertos: un
 * endpoint nuevo bajo `/api/lo-que-sea/route.ts` queda limitado por sesión
 * *por defecto*, sin que quien lo escriba tenga que acordarse de nada. Para
 * sacarlo de ese límite hay que agregarlo acá a propósito, a la vista en el
 * diff — el mismo espíritu que `whereDeAgenda`/`HtmlSeguro`: el camino fácil
 * es el seguro, no al revés.
 */
const PREFIJOS_SIN_LIMITE_DE_PANEL = [
  "/api/auth", // NextAuth + registro/recuperación: su propio límite, antes de que exista sesión
  "/api/cron", // Lo llama Vercel con un secreto, no una persona
  "/api/reservar", // Página pública de reservas, sin sesión
  "/api/equipo/invitacion", // Aceptar invitación: por token, antes de tener sesión
]

function esRutaDePanel(pathname: string): boolean {
  return pathname.startsWith("/api/") && !PREFIJOS_SIN_LIMITE_DE_PANEL.some((prefijo) => pathname.startsWith(prefijo))
}

export default async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname

  // Rate limiting sobre el intento de login por credenciales, antes de que NextAuth lo procese
  if (pathname === "/api/auth/callback/credentials") {
    const { permitido } = await verificarLimite("login", obtenerIp(req))
    if (!permitido) {
      return NextResponse.json({ error: "Demasiados intentos, intenta más tarde" }, { status: 429 })
    }
    return NextResponse.next()
  }

  // Rate limit genérico de los endpoints autenticados del panel (citas,
  // pacientes, configuración, equipo, chats, dashboard...). Se cuenta por
  // sesión, no sólo por IP: un salón con wifi compartido sale por una sola
  // IP, y varias personas del mismo negocio no deben poder gastarse el cupo
  // entre ellas. Sin sesión válida el propio endpoint responde 401; acá se
  // cuenta por IP nomás para no dejar la petición completamente sin tope.
  if (esRutaDePanel(pathname)) {
    const token = await getToken({ req })
    const clave = token?.id ? `usuario:${token.id}` : `ip:${obtenerIp(req)}`
    const tipo = req.method === "GET" || req.method === "HEAD" ? "panelLectura" : "panelEscritura"

    const { permitido } = await verificarLimite(tipo, clave)
    if (!permitido) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes, esperá un momento e intentá de nuevo" },
        { status: 429 }
      )
    }
    return NextResponse.next()
  }

  // El resto de `/api` (auth, cron, reservar, invitación) ya resolvió lo suyo
  // arriba o no lo necesita: lo que sigue es sólo para páginas del panel.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next()
  }

  const token = await getToken({ req })

  if (!token) {
    return NextResponse.redirect(new URL("/iniciar-sesion", req.url))
  }

  // Autenticado pero sin negocio → completar perfil antes de entrar al dashboard
  if (pathname.startsWith("/dashboard") && !token.businessId) {
    return NextResponse.redirect(new URL("/completar-perfil", req.url))
  }

  // Ya tiene negocio → no necesita estar en completar-perfil
  if (pathname === "/completar-perfil" && token.businessId) {
    return NextResponse.redirect(new URL("/dashboard", req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/dashboard/:path*", "/completar-perfil", "/api/:path*"],
}
