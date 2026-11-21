import { NextResponse } from "next/server"
import { getToken } from "next-auth/jwt"
import type { NextRequest } from "next/server"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"
import { construirCsp, generarNonce } from "@/lib/csp"
import { respuestaDeCuerpoDemasiadoGrande, TOPE_DE_CUALQUIER_PEDIDO } from "@/lib/cuerpo-del-pedido"

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
  "/api/correos/baja", // Baja de los correos de prueba: por token firmado, sin sesión; su propio límite por IP
  "/api/correos/baja-de-cliente", // Baja de los correos promocionales de un cliente: por token firmado, sin sesión; su propio límite por IP
]

/**
 * El prefijo cubre la ruta y lo que cuelga de ella, por segmentos: con un
 * `startsWith` a secas, "/api/correos/baja" cubría también cualquier
 * "/api/correos/baja-lo-que-sea" por casualidad. Cada excepción se escribe
 * entera, a la vista.
 */
const cubre = (pathname: string, prefijo: string) => pathname === prefijo || pathname.startsWith(`${prefijo}/`)

function esRutaDePanel(pathname: string): boolean {
  return pathname.startsWith("/api/") && !PREFIJOS_SIN_LIMITE_DE_PANEL.some((prefijo) => cubre(pathname, prefijo))
}

/** Páginas que exigen sesión: el panel, completar el perfil y elegir con qué negocio trabajar. */
function esPaginaConSesion(pathname: string): boolean {
  return (
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/completar-perfil" ||
    pathname === "/elegir-negocio"
  )
}

/**
 * La ruta como la entiende el enrutador: cada segmento decodificado.
 * `req.nextUrl.pathname` llega tal como se escribió, y Next igual enruta
 * `/api/auth/callback/credential%73` a `[...nextauth]` con el segmento ya
 * decodificado (`credentials`): comparar la ruta cruda dejaba saltarse el
 * límite de login, y el de `update()`, con sólo codificar una letra.
 *
 * Por segmento y no la ruta entera: un segmento mal codificado (`%E0%A4`)
 * queda como vino sin impedir que se decodifiquen los demás. No es ninguna de
 * las rutas que se comparan, y Next lo rechaza solo.
 */
export function rutaDecodificada(pathname: string): string {
  return pathname
    .split("/")
    .map((segmento) => {
      try {
        return decodeURIComponent(segmento)
      } catch {
        return segmento
      }
    })
    .join("/")
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
  const pathname = rutaDecodificada(req.nextUrl.pathname)

  // Primera barrera contra cuerpos absurdos (GHSA-mrhx-c7xc-m3w5): si el
  // `Content-Length` declarado ya pasa el techo de toda la API, ni se llega al
  // endpoint. Es sólo la cabecera; el tope real, también para cuerpos sin
  // cabecera o que mienten, lo pone cada endpoint al leer
  // (`lib/cuerpo-del-pedido.ts`).
  if (pathname.startsWith("/api/") && Number(req.headers.get("content-length") ?? "0") > TOPE_DE_CUALQUIER_PEDIDO) {
    return respuestaDeCuerpoDemasiadoGrande()
  }

  // Rate limiting sobre el intento de login por credenciales, antes de que
  // NextAuth lo procese. Es la primera barrera; la que no depende de cómo se
  // escriba la ruta está adentro de `authorize` (`lib/auth.ts`). El 429 trae
  // además `url` con el código del error, que es lo que lee `signIn` de
  // next-auth: sin ella lanzaba un TypeError y el botón quedaba girando.
  if (pathname === "/api/auth/callback/credentials") {
    const { permitido } = await verificarLimite("login", obtenerIp(req))
    if (!permitido) {
      return NextResponse.json(
        {
          error: "Demasiados intentos, intenta más tarde",
          url: new URL("/iniciar-sesion?error=DemasiadosIntentos", req.url).toString(),
        },
        { status: 429 }
      )
    }
    return continuar()
  }

  // `update()` de la sesión (POST /api/auth/session): el callback `jwt` de
  // `lib/auth.ts` revalida contra la base en cada uno, así que sin tope una
  // sesión podía pedirlo en bucle (#49). Lleva el límite de escritura del
  // panel, por sesión. El GET (el que el cliente de NextAuth pide solo, al
  // volver a la pestaña) sigue sin tope, como el resto de /api/auth: cortarlo
  // dejaría al panel sin sesión. Si se pasa, el `update()` del navegador
  // devuelve null y la sesión que ya tenía queda igual.
  if (pathname === "/api/auth/session" && req.method === "POST") {
    const token = await getToken({ req })
    const clave = token?.id ? `usuario:${token.id}` : `ip:${obtenerIp(req)}`
    const { permitido } = await verificarLimite("panelEscritura", clave)
    if (!permitido) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes, esperá un momento e intentá de nuevo" },
        { status: 429 }
      )
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

  // Sin contexto elegido no se entra al panel: con algún negocio (propio o
  // de una membresía) se elige con cuál trabajar; sin ninguno, se completa el
  // perfil. Un token de antes de los contextos no trae la cuenta: va a
  // completar el perfil como antes, y ahí el `update()` lo rearma.
  const contextos = token.contextos ?? 0
  if (pathname.startsWith("/dashboard") && !token.businessId) {
    return NextResponse.redirect(new URL(contextos > 0 ? "/elegir-negocio" : "/completar-perfil", req.url))
  }

  // Completar el perfil crea el negocio propio: quien ya es dueño de uno no
  // tiene nada que hacer ahí. Quien sólo es miembro de otros, sí: puede crear
  // el suyo (suma un contexto de dueño).
  if (pathname === "/completar-perfil" && (token.tieneNegocioPropio || (token.businessId && token.role === "owner"))) {
    return NextResponse.redirect(new URL("/dashboard", req.url))
  }

  // Sin ningún negocio no hay nada que elegir.
  if (pathname === "/elegir-negocio" && contextos === 0 && !token.businessId) {
    return NextResponse.redirect(new URL("/completar-perfil", req.url))
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
