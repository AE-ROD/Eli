"use client"

import { motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"
import { TrendingUp, TrendingDown } from "lucide-react"

interface Props {
  label: string
  valor: string | number
  icono: LucideIcon
  color?: string
  variacionPct?: number | null
  delay?: number
}

export function TarjetaKpi({ label, valor, icono: Icono, color = "text-primary", variacionPct, delay = 0 }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-card border border-border/50 rounded-xl p-5 flex items-center gap-4"
    >
      <div className={`p-3 rounded-xl bg-muted ${color}`}>
        <Icono className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold text-foreground tabular-nums truncate">{valor}</p>
          {variacionPct !== null && variacionPct !== undefined && (
            <span
              className={`flex items-center gap-0.5 text-xs font-medium ${
                variacionPct >= 0 ? "text-success" : "text-destructive"
              }`}
            >
              {variacionPct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {Math.abs(variacionPct)}%
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}
