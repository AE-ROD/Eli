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
  const [planCargando, setPlanCargando] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const abrirPrecios = () => {
    setError(null)
    setAbierto(true)
  }

  const seleccionarPlan = async (planId: string, _periodo: "mensual" | "anual") => {
    setError(null)

    if (planId !== "pro" && planId !== "team") {
      setError("El plan Free no requiere pago. Puedes usarlo sin pasar por Stripe.")
      return
    }

    setPlanCargando(planId)

    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      })
      const data = await response.json() as { url?: string; error?: string }

      if (!response.ok) {
        setError(data.error ?? "No pudimos iniciar el pago. Inténtalo nuevamente.")
        return
      }

      if (!data.url) {
        setError("Stripe no devolvió un enlace de pago. Inténtalo nuevamente.")
        return
      }

      window.location.href = data.url
    } catch {
      setError("No pudimos conectar con Stripe. Revisa tu conexión e inténtalo nuevamente.")
    } finally {
      setPlanCargando(null)
    }
  }

  return (
    <PreciosContext.Provider value={{ abrirPrecios }}>
      {children}
      <ModalPrecios
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        diasTrialRestantes={diasTrialRestantes}
        onSeleccionarPlan={seleccionarPlan}
        planCargando={planCargando}
        error={error}
      />
    </PreciosContext.Provider>
  )
}
