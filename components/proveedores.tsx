"use client"

import { SessionProvider } from "next-auth/react"

export function Proveedores({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}
