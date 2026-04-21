import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
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
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { business: true },
        })

        if (!user) return null

        const passwordValida = await bcrypt.compare(
          credentials.password,
          user.password
        )

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
    async jwt({ token, user }) {
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
