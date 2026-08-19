import NextAuth from "next-auth"
import type { Role } from "@/lib/permisos"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name: string
      email: string
      role: Role
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
    role?: Role
    businessId?: string | null
    businessName?: string | null
    businessSlug?: string | null
    memberId?: string | null
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    role?: Role
    businessId?: string | null
    businessName?: string | null
    businessSlug?: string | null
    memberId?: string | null
  }
}
