"use client"

import { Calendar } from "lucide-react"

export interface RangoPeriodo {
  from: string // YYYY-MM-DD
  to: string // YYYY-MM-DD
}

interface Props {
  rango: RangoPeriodo
  onChange: (rango: RangoPeriodo) => void
}

function formatoFecha(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function presetRango(dias: number): RangoPeriodo {
  const hoy = new Date()
  const desde = new Date(hoy)
  desde.setDate(desde.getDate() - (dias - 1))
  return { from: formatoFecha(desde), to: formatoFecha(hoy) }
}

function presetMesActual(): RangoPeriodo {
  const hoy = new Date()
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  return { from: formatoFecha(inicio), to: formatoFecha(hoy) }
}

function presetMesAnterior(): RangoPeriodo {
  const hoy = new Date()
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
  const fin = new Date(hoy.getFullYear(), hoy.getMonth(), 0)
  return { from: formatoFecha(inicio), to: formatoFecha(fin) }
}

const PRESETS: { label: string; calcular: () => RangoPeriodo }[] = [
  { label: "Últimos 7 días", calcular: () => presetRango(7) },
  { label: "Últimos 30 días", calcular: () => presetRango(30) },
  { label: "Este mes", calcular: presetMesActual },
  { label: "Mes anterior", calcular: presetMesAnterior },
  { label: "Últimos 90 días", calcular: () => presetRango(90) },
]

export function SelectorPeriodo({ rango, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3" data-no-print>
      <div className="flex items-center gap-2 bg-card border border-border/50 rounded-lg px-3 py-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <input
          type="date"
          value={rango.from}
          max={rango.to}
          onChange={(e) => onChange({ ...rango, from: e.target.value })}
          className="text-sm bg-transparent text-foreground focus:outline-none"
        />
        <span className="text-muted-foreground text-sm">–</span>
        <input
          type="date"
          value={rango.to}
          min={rango.from}
          onChange={(e) => onChange({ ...rango, to: e.target.value })}
          className="text-sm bg-transparent text-foreground focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => onChange(p.calcular())}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors"
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function rangoPorDefecto(): RangoPeriodo {
  return presetRango(30)
}
