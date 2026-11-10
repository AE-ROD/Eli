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
      /**
       * El rubro del negocio (`Business.type`, `lib/rubros.ts`). Null en una
       * sesión de antes de este campo: no es dental (`esRubroDental`).
       */
      rubro: string | null
      memberId: string | null
      /**
       * El id del contexto con el que trabaja la sesión (`lib/contextos.ts`):
       * qué negocio y con qué rol. Null si la cuenta tiene varios y todavía no
       * eligió, o ninguno. Sólo informa: los permisos salen de `role`,
       * `businessId` y `memberId`, que `lib/auth.ts` arma desde la base.
       */
      contexto: string | null
      /** Cuántos contextos tiene la cuenta: con más de uno, el panel ofrece cambiar de negocio. */
      contextos: number
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
    rubro?: string | null
    memberId?: string | null
    contexto?: string | null
    contextos?: number
    tieneNegocioPropio?: boolean
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
    /** El rubro del negocio. Lo trae `perfilDe`; un token viejo no lo tiene hasta revalidarse. */
    rubro?: string | null
    memberId?: string | null
    /**
     * El id del contexto elegido (`lib/contextos.ts`). Se vuelve a buscar
     * entre los de la cuenta en cada revalidación: si ya no existe, la sesión
     * se queda sin negocio (falla cerrado) y vuelve a elegir.
     */
    contexto?: string | null
    /** Cuántos contextos tiene la cuenta. El proxy decide con esto entre elegir negocio y completar el perfil. */
    contextos?: number
    /** Si la cuenta es dueña de un negocio: quien no lo es puede crear el suyo en completar-perfil. */
    tieneNegocioPropio?: boolean
    /** Cuándo se inició esta sesión (ms). Se compara con `User.sesionesValidasDesde`. */
    emitidoEn?: number
    /** Última vez que el token se contrastó con la base (ms). Ver `REVALIDAR_CADA_MS`. */
    revalidadoEn?: number
  }
}
