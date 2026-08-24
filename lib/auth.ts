import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import GoogleProvider from "next-auth/providers/google"
import { prisma } from "@/lib/prisma"
import type { Rol } from "@/lib/permisos"
import bcrypt from "bcryptjs"

/** El usuario con lo necesario para saber en qué negocio entra y con qué rol. */
const CON_NEGOCIO = {
  business: true,
  memberships: { include: { business: true }, take: 1 },
} as const

type UsuarioConNegocio = NonNullable<
  Awaited<ReturnType<typeof buscarUsuario>>
>

function buscarUsuario(where: { id: string } | { email: string }) {
  return prisma.user.findUnique({ where, include: CON_NEGOCIO })
}

/**
 * Un usuario es dueño si el negocio le pertenece; si no, entra por su membresía.
 * Sin membresía válida cae a `worker`, el rol con menos permisos.
 */
function perfilDe(usuario: UsuarioConNegocio) {
  const membresia = usuario.memberships[0]
  const negocio = usuario.business ?? membresia?.business ?? null
  const rol: Rol = usuario.business ? "owner" : membresia?.role === "admin" ? "admin" : "worker"

  return {
    role: rol,
    businessId: negocio?.id ?? null,
    businessName: negocio?.name ?? null,
    businessSlug: negocio?.slug ?? null,
    memberId: membresia?.id ?? null,
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/iniciar-sesion" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const usuario = await buscarUsuario({ email: credentials.email })

        // Quien se registró con Google no tiene contraseña que comparar.
        if (!usuario?.password) return null
        if (!(await bcrypt.compare(credentials.password, usuario.password))) return null

        return {
          id: usuario.id,
          name: usuario.name,
          email: usuario.email,
          ...perfilDe(usuario),
        }
      },
    }),
  ],
  callbacks: {
    // Crea el usuario la primera vez que entra con Google.
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true

      try {
        const email = user.email!
        const existente = await prisma.user.findUnique({ where: { email } })
        if (!existente) {
          // Sin contraseña: este usuario sólo puede entrar por Google.
          await prisma.user.create({
            data: { name: user.name ?? "Usuario", email, password: "" },
          })
        }
        return true
      } catch {
        return false
      }
    },

    async jwt({ token, user, account, trigger }) {
      // Al completar el perfil ("update") o al entrar con Google, el token se
      // rearma desde la base: es la única fuente confiable del rol y el negocio.
      const recargar =
        trigger === "update" ? { id: token.id } : account?.provider === "google" ? { email: token.email! } : null

      if (recargar) {
        const usuario = await buscarUsuario(recargar)
        if (usuario) Object.assign(token, { id: usuario.id }, perfilDe(usuario))
        return token
      }

      // Primer login con credenciales: lo que devolvió `authorize`.
      if (user) {
        Object.assign(token, {
          id: user.id,
          role: user.role,
          businessId: user.businessId,
          businessName: user.businessName,
          businessSlug: user.businessSlug,
          memberId: user.memberId,
        })
      }

      return token
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id
        session.user.role = token.role ?? null
        session.user.businessId = token.businessId ?? ""
        session.user.businessName = token.businessName ?? ""
        session.user.businessSlug = token.businessSlug ?? ""
        session.user.memberId = token.memberId ?? null
      }
      return session
    },
  },
}
