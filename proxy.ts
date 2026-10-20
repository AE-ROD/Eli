import { NextResponse } from "next/server"
import { getToken } from "next-auth/jwt"
import type { NextRequest } from "next/server"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"
import { construirCsp, generarNonce } from "@/lib/csp"

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

/** Páginas que exigen sesión: las que el proxy cubría antes de sumar la CSP. */
function esPaginaConSesion(pathname: string): boolean {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/") || pathname === "/completar-perfil"
}

/**
 * La cookie de sesión de NextAuth v4: con `__Secure-` en https, sin prefijo en
 * http. Si el JWT no entra en una cookie, NextAuth lo parte en `.0`, `.1`...
 */
const COOKIES_DE_SESION = ["next-auth.session-token", "__Secure-next-auth.session-token"]

/**
 * Manda a iniciar sesión y vence las cookies de sesión. Para una sesión que la
 * revalidación de `lib/auth.ts` revocó (usuario borrado, o sesiones cerradas
 * por un restablecimiento de contraseña): el token sigue ahí pero sin `id`, y
 * ningún endpoint lo acepta, así que hay que sacarlo del navegador.
 */
function cerrarSesion(req: NextRequest): NextResponse {
  const respuesta = NextResponse.redirect(new URL("/iniciar-sesion?error=SesionCerrada", req.url))
  const presentes = req.cookies.getAll().map((cookie) => cookie.name)
  const nombres = new Set([
    ...COOKIES_DE_SESION,
    ...presentes.filter((nombre) => COOKIES_DE_SESION.some((base) => nombre.startsWith(`${base}.`))),
  ])
  for (const nombre of nombres) {
    // Una cookie `__Secure-` sólo la pisa una respuesta que también la marque Secure.
    respuesta.cookies.set(nombre, "", {
      path: "/",
      maxAge: 0,
      httpOnly: true,
      sameSite: "lax",
      secure: nombre.startsWith("__Secure-"),
    })
  }
  return respuesta
}

/**
 * Next 16 renombró la convención `middleware` a `proxy`: es la misma puerta de
 * entrada (rate limit y sesión antes de llegar a las rutas), con otro nombre.
 * Corre en Node.js y no en Edge, que es lo que la convención nueva trae por
 * defecto.
 *
 * Además arma la Content-Security-Policy con un nonce nuevo por petición
 * (`lib/csp.ts`). La CSP va en la petición, porque de ahí lee Next el nonce
 * para ponérselo a sus `<script>`, y en TODA respuesta que sale de acá
 * (páginas, API, redirecciones y 429), que es la que aplica el navegador.
 */
export default async function proxy(req: NextRequest) {
  const csp = construirCsp(generarNonce(), { desarrollo: process.env.NODE_ENV !== "production" })

  const cabecerasDePeticion = new Headers(req.headers)
  cabecerasDePeticion.set("Content-Security-Policy", csp)

  const respuesta = await decidir(req, () => NextResponse.next({ request: { headers: cabecerasDePeticion } }))
  respuesta.headers.set("Content-Security-Policy", csp)
  return respuesta
}

/**
 * Rate limit, sesión y redirecciones. `continuar` deja pasar la petición con
 * la CSP adentro; cualquier otra respuesta (429, redirect) corta acá.
 */
async function decidir(req: NextRequest, continuar: () => NextResponse): Promise<NextResponse> {
  const pathname = req.nextUrl.pathname

  // Rate limiting sobre el intento de login por credenciales, antes de que NextAuth lo procese
  if (pathname === "/api/auth/callback/credentials") {
    const { permitido } = await verificarLimite("login", obtenerIp(req))
    if (!permitido) {
      return NextResponse.json({ error: "Demasiados intentos, intenta más tarde" }, { status: 429 })
    }
    return continuar()
  }

  // Rate limit genérico de los endpoints autenticados del panel (citas,
  // clientes, configuración, equipo, chats, dashboard...). Se cuenta por
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
    return continuar()
  }

  // El resto de `/api` (auth, cron, reservar, invitación) ya resolvió lo suyo
  // arriba o no lo necesita, y las páginas públicas (landing, acceso, reserva)
  // sólo vienen por la CSP: lo que sigue es sólo para páginas del panel.
  if (pathname.startsWith("/api/") || !esPaginaConSesion(pathname)) {
    return continuar()
  }

  const token = await getToken({ req })

  if (!token) {
    return NextResponse.redirect(new URL("/iniciar-sesion", req.url))
  }

  // Token sin `id`: la sesión fue revocada. No es un usuario nuevo de Google
  // (ése ya tiene `id`, lo crea el callback `signIn`): completar-perfil le
  // respondería 401 y quedaría atrapado ahí.
  if (!token.id) {
    return cerrarSesion(req)
  }

  // Autenticado pero sin negocio → completar perfil antes de entrar al dashboard
  if (pathname.startsWith("/dashboard") && !token.businessId) {
    return NextResponse.redirect(new URL("/completar-perfil", req.url))
  }

  // Ya tiene negocio → no necesita estar en completar-perfil
  if (pathname === "/completar-perfil" && token.businessId) {
    return NextResponse.redirect(new URL("/dashboard", req.url))
  }

  return continuar()
}

/**
 * Las tres primeras entradas son las de siempre (`/dashboard`,
 * `/completar-perfil` y `/api`): siguen pasando por el mismo rate limit y las
 * mismas redirecciones, sin excepciones de extensión. La última suma el resto
 * de las páginas, sólo por la CSP: todo menos lo que nunca es HTML, o sea los
 * assets de Next (`_next/static`, `_next/image`), el favicon y los archivos
 * públicos con extensión (imágenes, fuentes, etc.).
 *
 * A propósito NO excluye los prefetch de `next/link` (como sugiere la guía de
 * Next): saltear el proxy en un prefetch de `/dashboard` también saltearía el
 * control de sesión.
 */
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/completar-perfil",
    "/api/:path*",
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpe?g|gif|svg|webp|avif|ico|txt|xml|webmanifest|woff2?|ttf|otf|css|js|map)$).*)",
  ],
}
