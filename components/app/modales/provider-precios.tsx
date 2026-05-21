"use client"

import { createContext, useContext, useState, type ReactNode } from "react"
import { ModalPrecios } from "@/components/app/modales/modal-precios"

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

export function ProviderPrecios({ children, diasTrialRestantes }: Props) {
  const [abierto, setAbierto] = useState(false)

  return (
    <PreciosContext.Provider value={{ abrirPrecios: () => setAbierto(true) }}>
      {children}
      <ModalPrecios
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        diasTrialRestantes={diasTrialRestantes}
        onSeleccionarPlan={(planId, periodo) => {
          // TODO: conectar con Stripe Checkout
          console.log("Plan seleccionado:", planId, periodo)
        }}
      />
    </PreciosContext.Provider>
  )
}
