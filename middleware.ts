import { withAuth, type NextRequestWithAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

const SUPPORTED_LOCALES = ["es", "en", "pt"]

function detectLocale(req: NextRequestWithAuth): string {
  const cookie = req.cookies.get("eli-locale")?.value
  if (cookie && SUPPORTED_LOCALES.includes(cookie)) return cookie

  const acceptLang = req.headers.get("accept-language") ?? ""
  const browserLocale = acceptLang.split(",")[0]?.split("-")[0]?.toLowerCase()
  if (browserLocale && SUPPORTED_LOCALES.includes(browserLocale)) return browserLocale

  return "es"
}

export default withAuth(
  function middleware(req: NextRequestWithAuth) {
    const { pathname } = req.nextUrl
    const token = req.nextauth.token

    // Booking routes: inject x-locale header, no auth redirect
    if (pathname.startsWith("/reservar/")) {
      const locale = detectLocale(req)
      const requestHeaders = new Headers(req.headers)
      requestHeaders.set("x-locale", locale)
      return NextResponse.next({ request: { headers: requestHeaders } })
    }

    // Auth redirects for dashboard routes
    if (pathname.startsWith("/dashboard") && !token?.businessId) {
      return NextResponse.redirect(new URL("/completar-perfil", req.url))
    }
    if (pathname === "/completar-perfil" && token?.businessId) {
      return NextResponse.redirect(new URL("/dashboard", req.url))
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      // Booking routes are public — pass through without auth check
      authorized: ({ token, req }) => {
        if (req.nextUrl.pathname.startsWith("/reservar/")) return true
        return !!token
      },
    },
    pages: {
      signIn: "/iniciar-sesion",
    },
  }
)

export const config = {
  matcher: ["/dashboard/:path*", "/completar-perfil", "/reservar/:path*"],
}
