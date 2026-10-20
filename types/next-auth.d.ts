import NextAuth from "next-auth"
import type { Rol } from "@/lib/permisos"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name: string
      email: string
      /** Null si el token viene incompleto: sin rol no se concede nada. */
      role: Rol | null
      businessId: string
      businessName: string
      businessSlug: string
      memberId: string | null
    }
  }

  interface User {
    id: string
    name: string
    email: string
    role?: Rol
    businessId?: string | null
    businessName?: string | null
    businessSlug?: string | null
    memberId?: string | null
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    /** Vacío si la sesión se revocó (usuario borrado o contraseña restablecida). */
    id: string
    role?: Rol
    businessId?: string | null
    businessName?: string | null
    businessSlug?: string | null
    memberId?: string | null
    /** Cuándo se inició esta sesión (ms). Se compara con `User.sesionesValidasDesde`. */
    emitidoEn?: number
    /** Última vez que el token se contrastó con la base (ms). Ver `REVALIDAR_CADA_MS`. */
    revalidadoEn?: number
  }
}
