"use client"

import { ChevronLeft, ChevronRight, Calendar, List, Grid3X3 } from "lucide-react"

export type VistaCalendario = "dia" | "semana" | "mes"

const diasSemana = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

interface ControlesCalendarioProps {
  fechaActual: Date
  vista: VistaCalendario
  onAnterior: () => void
  onSiguiente: () => void
  onHoy: () => void
  onVista: (v: VistaCalendario) => void
}

function formatoFecha(fecha: Date, vista: VistaCalendario): string {
  if (vista === "dia") {
    return fecha.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })
  }
  return `${meses[fecha.getMonth()]} ${fecha.getFullYear()}`
}

export function ControlesCalendario({
  fechaActual,
  vista,
  onAnterior,
  onSiguiente,
  onHoy,
  onVista,
}: ControlesCalendarioProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center bg-card border border-border/50 rounded-lg">
          <button onClick={onAnterior} className="p-2 hover:bg-muted transition-colors rounded-l-lg">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button onClick={onHoy} className="px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
            Hoy
          </button>
          <button onClick={onSiguiente} className="p-2 hover:bg-muted transition-colors rounded-r-lg">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <h2 className="text-lg font-semibold text-foreground capitalize">
          {formatoFecha(fechaActual, vista)}
        </h2>
      </div>

      <div className="flex items-center gap-2 bg-card border border-border/50 rounded-lg p-1">
        {([
          { id: "dia" as const, label: "Día", icono: Calendar },
          { id: "semana" as const, label: "Semana", icono: List },
          { id: "mes" as const, label: "Mes", icono: Grid3X3 },
        ] as const).map(({ id, label, icono: Icono }) => (
          <button
            key={id}
            onClick={() => onVista(id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              vista === id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <Icono className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export { diasSemana }
