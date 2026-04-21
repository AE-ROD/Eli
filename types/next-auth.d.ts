import NextAuth from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      name: string
      email: string
      businessId: string
      businessName: string
    }
  }

  interface User {
    id: string
    name: string
    email: string
    businessId?: string | null
    businessName?: string | null
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    businessId?: string | null
    businessName?: string | null
  }
}
