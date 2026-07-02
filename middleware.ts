import { NextResponse } from "next/server"
import { getToken } from "next-auth/jwt"
import type { NextRequest } from "next/server"
import { obtenerIp, verificarLimite } from "@/lib/rate-limit"

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
  matcher: ["/dashboard/:path*", "/completar-perfil", "/api/auth/callback/credentials"],
}
