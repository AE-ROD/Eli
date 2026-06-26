"use client"

import { createContext, useContext, useState, useEffect } from "react"
import { usePathname } from "next/navigation"

interface SidebarCtx { abierto: boolean; toggle: () => void; cerrar: () => void }

const SidebarContext = createContext<SidebarCtx>({ abierto: false, toggle: () => {}, cerrar: () => {} })

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false)
  const pathname = usePathname()

  useEffect(() => { setAbierto(false) }, [pathname])

  return (
    <SidebarContext.Provider value={{ abierto, toggle: () => setAbierto((a) => !a), cerrar: () => setAbierto(false) }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() { return useContext(SidebarContext) }
