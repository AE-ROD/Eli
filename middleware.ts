import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const pathname = req.nextUrl.pathname

    // Autenticado pero sin negocio → completar perfil antes de entrar al dashboard
    if (pathname.startsWith("/dashboard") && !token?.businessId) {
      return NextResponse.redirect(new URL("/completar-perfil", req.url))
    }

    // Ya tiene negocio → no necesita estar en completar-perfil
    if (pathname === "/completar-perfil" && token?.businessId) {
      return NextResponse.redirect(new URL("/dashboard", req.url))
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: "/iniciar-sesion",
    },
  }
)

export const config = {
  matcher: ["/dashboard/:path*", "/completar-perfil"],
}
