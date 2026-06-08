"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { BarraSuperior } from "@/components/app/layout/barra-superior"
import { Check, Zap, Users, Crown } from "lucide-react"
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

export default function UpgradePage() {
  const [loading, setLoading] = useState<string | null>(null)

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

          {/* Plan cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {(["pro", "team"] as const).map((key, i) => {
              const plan = PLANS[key]
              const Icon = PLAN_ICONS[key]
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
                    <div>
                      <p className="font-bold text-foreground">{plan.name}</p>
                      <p className="text-2xl font-bold text-foreground">
                        ${plan.price}
                        <span className="text-sm font-normal text-muted-foreground"> USD/mes</span>
                      </p>
                    </div>
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
