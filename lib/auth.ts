import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import GoogleProvider from "next-auth/providers/google"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/iniciar-sesion",
  },
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

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: {
            business: true,
            memberships: { include: { business: true }, take: 1 },
          },
        })

        // Usuario registrado con Google no puede usar contraseña
        if (!user || !user.password) return null

        const passwordValida = await bcrypt.compare(credentials.password, user.password)
        if (!passwordValida) return null

        const membership = user.memberships[0]
        const negocio = user.business ?? membership?.business ?? null

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.business ? "owner" : (membership?.role ?? "worker"),
          businessId: negocio?.id ?? null,
          businessName: negocio?.name ?? null,
          businessSlug: negocio?.slug ?? null,
          memberId: membership?.id ?? null,
        }
      },
    }),
  ],
  callbacks: {
    // Crea el usuario en la BD cuando inicia sesión con Google por primera vez
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        try {
          const existente = await prisma.user.findUnique({
            where: { email: user.email! },
          })
          if (!existente) {
            await prisma.user.create({
              data: {
                name: user.name ?? "Usuario",
                email: user.email!,
                password: "", // Sin contraseña para usuarios OAuth
              },
            })
          }
          return true
        } catch {
          return false
        }
      }
      return true
    },

    async jwt({ token, user, account, trigger }) {
      // Refresca el token cuando el usuario completa su perfil
      if (trigger === "update") {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          include: {
            business: true,
            memberships: { include: { business: true }, take: 1 },
          },
        })
        if (dbUser) {
          const membership = dbUser.memberships[0]
          const negocio = dbUser.business ?? membership?.business ?? null
          token.role = dbUser.business ? "owner" : (membership?.role ?? "worker")
          token.businessId = negocio?.id ?? null
          token.businessName = negocio?.name ?? null
          token.businessSlug = negocio?.slug ?? null
          token.memberId = membership?.id ?? null
        }
        return token
      }

      // Primer login con Google: carga datos desde la BD
      if (account?.provider === "google") {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email! },
          include: {
            business: true,
            memberships: { include: { business: true }, take: 1 },
          },
        })
        if (dbUser) {
          const membership = dbUser.memberships[0]
          const negocio = dbUser.business ?? membership?.business ?? null
          token.id = dbUser.id
          token.role = dbUser.business ? "owner" : (membership?.role ?? "worker")
          token.businessId = negocio?.id ?? null
          token.businessName = negocio?.name ?? null
          token.businessSlug = negocio?.slug ?? null
          token.memberId = membership?.id ?? null
        }
        return token
      }

      // Primer login con credenciales
      if (user) {
        token.id = user.id
        token.role = (user as any).role
        token.businessId = (user as any).businessId
        token.businessName = (user as any).businessName
        token.businessSlug = (user as any).businessSlug
        token.memberId = (user as any).memberId
      }

      return token
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string
        ;(session.user as any).role = token.role as string
        ;(session.user as any).businessId = token.businessId as string
        ;(session.user as any).businessName = token.businessName as string
        ;(session.user as any).businessSlug = token.businessSlug as string
        ;(session.user as any).memberId = token.memberId as string | null
      }
      return session
    },
  },
}
