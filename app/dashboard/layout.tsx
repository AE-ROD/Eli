"use client"

import { useState, useEffect } from "react"
import { BarraLateral } from "@/components/eli/app/barra-lateral"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [sidebarColapsado, setSidebarColapsado] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      <BarraLateral />
      <main className="lg:ml-[260px] transition-all duration-300">
        {children}
      </main>
    </div>
  )
}
