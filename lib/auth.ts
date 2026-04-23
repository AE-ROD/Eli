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
          include: { business: true },
        })

        // Usuario registrado con Google no puede usar contraseña
        if (!user || !user.password) return null

        const passwordValida = await bcrypt.compare(credentials.password, user.password)
        if (!passwordValida) return null

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          businessId: user.business?.id ?? null,
          businessName: user.business?.name ?? null,
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
      // Refresca el token cuando el usuario completa su perfil (completar-perfil)
      if (trigger === "update") {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          include: { business: true },
        })
        if (dbUser) {
          token.businessId = dbUser.business?.id ?? null
          token.businessName = dbUser.business?.name ?? null
        }
        return token
      }

      // Primer login con Google: carga datos desde la BD
      if (account?.provider === "google") {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email! },
          include: { business: true },
        })
        if (dbUser) {
          token.id = dbUser.id
          token.businessId = dbUser.business?.id ?? null
          token.businessName = dbUser.business?.name ?? null
        }
        return token
      }

      // Primer login con credenciales
      if (user) {
        token.id = user.id
        token.businessId = (user as any).businessId
        token.businessName = (user as any).businessName
      }

      return token
    },

    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string
        ;(session.user as any).businessId = token.businessId as string
        ;(session.user as any).businessName = token.businessName as string
      }
      return session
    },
  },
}
