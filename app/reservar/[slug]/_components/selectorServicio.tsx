"use client"

import { motion } from "framer-motion"
import { Clock, DollarSign } from "lucide-react"
import { t } from "@/lib/i18n/booking"

export interface ServicioPublico {
  id: string
  name: string
  description: string | null
  duration: number
  price: number | null
}

function formatDuracion(min: number): string {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}h` : `${h}h ${m}min`
}

interface SelectorServicioProps {
  servicios: ServicioPublico[]
  seleccionado: ServicioPublico | null
  onSeleccionar: (s: ServicioPublico) => void
  locale?: string
}

export function SelectorServicio({ servicios, seleccionado, onSeleccionar, locale = "es" }: SelectorServicioProps) {
  const hint = t(locale, "serviceNameHint")

  return (
    <div className="grid gap-3">
      {servicios.map((s) => (
        <motion.button
          key={s.id}
          type="button"
          onClick={() => onSeleccionar(s)}
          className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
            seleccionado?.id === s.id
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/40 hover:bg-muted/50"
          }`}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          aria-pressed={seleccionado?.id === s.id}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground">{s.name}</p>
              {/* T-DR7: hint for non-ES users that service names are in the business language */}
              {hint && (
                <p className="text-[11px] text-muted-foreground italic mt-0.5">{hint}</p>
              )}
              {s.description && (
                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{s.description}</p>
              )}
            </div>
            {seleccionado?.id === s.id && (
              <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0 mt-0.5" aria-hidden="true">
                <span className="text-primary-foreground text-xs">✓</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 mt-3">
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" aria-hidden="true" />
              {formatDuracion(s.duration)}
            </span>
            {s.price != null && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-foreground tabular-nums">
                <DollarSign className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                {s.price.toLocaleString("es-ES")}
              </span>
            )}
          </div>
        </motion.button>
      ))}
    </div>
  )
}
