"use client"

import { createContext, useContext, useState, type ReactNode } from "react"
import { ModalPrecios } from "@/components/panel/modal-precios"

interface PreciosContextType {
  abrirPrecios: () => void
}

const PreciosContext = createContext<PreciosContextType>({ abrirPrecios: () => {} })

export function usePrecios() {
  return useContext(PreciosContext)
}

interface Props {
  children: ReactNode
  diasTrialRestantes?: number
}

/** El modal de precios del panel. Todavía no hay cobro: sólo muestra los planes. */
export function ProveedorDePrecios({ children, diasTrialRestantes }: Props) {
  const [abierto, setAbierto] = useState(false)

  return (
    <PreciosContext.Provider value={{ abrirPrecios: () => setAbierto(true) }}>
      {children}
      <ModalPrecios abierto={abierto} onCerrar={() => setAbierto(false)} diasTrialRestantes={diasTrialRestantes} />
    </PreciosContext.Provider>
  )
}
