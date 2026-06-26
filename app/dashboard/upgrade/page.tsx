"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { BarraSuperior } from "@/components/app/layout/barra-superior"
import { Check, Zap, Crown } from "lucide-react"
import { PLANS } from "@/lib/stripe"

const PLAN_ICONS = { pro: Zap, team: Crown }
const PLAN_COLORS = {
  pro: "border-primary bg-primary/5",
  team: "border-amber-400/50 bg-amber-50/5",
}
const BTN_COLORS = {
  pro: "bg-primary text-primary-foreground hover:bg-primary/90",
  team: "bg-amber-500 text-white hover:bg-amber-500/90",
}

const PRECIOS = {
  pro:  { mensual: 19, anual: 190, ahorroAnual: 38 },
  team: { mensual: 49, anual: 490, ahorroAnual: 98 },
} as const

export default function UpgradePage() {
  const [loading, setLoading] = useState<string | null>(null)
  const [periodo, setPeriodo] = useState<"mensual" | "anual">("anual")

  const handleUpgrade = async (plan: "pro" | "team") => {
    setLoading(plan)
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      })
      const { url, error } = await res.json()
      if (error) { alert(error); return }
      window.location.href = url
    } catch {
      alert("Error al iniciar pago. Intenta de nuevo.")
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="min-h-screen">
      <BarraSuperior titulo="Actualizar plan" subtitulo="Elige el plan que mejor se adapta a tu negocio" />

      <div className="p-6">
        <div className="max-w-3xl mx-auto">
          {/* Free baseline */}
          <div className="bg-muted/30 border border-border/50 rounded-xl px-5 py-4 mb-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Plan gratuito</p>
              <p className="text-xs text-muted-foreground mt-0.5">1 trabajador · Solo ES · Email básico</p>
            </div>
            <span className="text-xs bg-muted text-muted-foreground px-3 py-1 rounded-full font-medium">Activo</span>
          </div>

          {/* Toggle mensual / anual */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <span className={`text-sm font-medium ${periodo === "mensual" ? "text-foreground" : "text-muted-foreground"}`}>
              Mensual
            </span>
            <button
              onClick={() => setPeriodo(p => p === "mensual" ? "anual" : "mensual")}
              className={`relative w-12 h-6 rounded-full transition-colors ${periodo === "anual" ? "bg-primary" : "bg-muted-foreground/30"}`}
            >
              <span
                className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all duration-200"
                style={{ left: periodo === "anual" ? "calc(100% - 22px)" : "2px" }}
              />
            </button>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium ${periodo === "anual" ? "text-foreground" : "text-muted-foreground"}`}>
                Anual
              </span>
              <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">
                Ahorra hasta 32%
              </span>
            </div>
          </div>

          {/* Plan cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {(["pro", "team"] as const).map((key, i) => {
              const plan = PLANS[key]
              const Icon = PLAN_ICONS[key]
              const precioMostrado = periodo === "mensual"
                ? PRECIOS[key].mensual
                : Math.round(PRECIOS[key].anual / 12)
              const precioAnual = periodo === "anual" ? PRECIOS[key].anual : null

              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className={`border-2 rounded-2xl p-6 flex flex-col ${PLAN_COLORS[key]}`}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-xl bg-background border border-border/50">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <p className="font-bold text-foreground">{plan.name}</p>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-end gap-1">
                      <span className="text-3xl font-bold text-foreground">${precioMostrado}</span>
                      <span className="text-muted-foreground text-sm mb-1">USD/mes</span>
                    </div>
                    {precioAnual !== null && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        ${precioAnual} USD/año · ahorras ${PRECIOS[key].ahorroAnual}
                      </p>
                    )}
                  </div>

                  <ul className="space-y-2 flex-1 mb-6">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm text-foreground">
                        <Check className="h-4 w-4 text-success flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => handleUpgrade(key)}
                    disabled={loading !== null}
                    className={`w-full py-2.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-60 ${BTN_COLORS[key]}`}
                  >
                    {loading === key ? "Redirigiendo..." : `Actualizar a ${plan.name}`}
                  </button>
                </motion.div>
              )
            })}
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            Pago seguro por Stripe · Cancela cuando quieras
          </p>
        </div>
      </div>
    </div>
  )
}
