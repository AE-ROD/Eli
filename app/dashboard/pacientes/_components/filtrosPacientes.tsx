"use client"

import { Search, Grid3X3, List } from "lucide-react"

const ETIQUETAS = ["Todos", "VIP", "Frecuente", "Nuevo", "Inactivo"]

interface FiltrosPacientesProps {
  busqueda: string
  onBusqueda: (v: string) => void
  etiquetaActiva: string
  onEtiqueta: (v: string) => void
  vista: "grid" | "lista"
  onVista: (v: "grid" | "lista") => void
}

export function FiltrosPacientes({
  busqueda,
  onBusqueda,
  etiquetaActiva,
  onEtiqueta,
  vista,
  onVista,
}: FiltrosPacientesProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 mb-6">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Buscar por nombre, email o teléfono..."
          value={busqueda}
          onChange={(e) => onBusqueda(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0">
        {ETIQUETAS.map((etiqueta) => (
          <button
            key={etiqueta}
            onClick={() => onEtiqueta(etiqueta)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              etiquetaActiva === etiqueta
                ? "bg-primary text-primary-foreground"
                : "bg-card border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
        <button
          onClick={() => onVista("grid")}
          className={`p-2 rounded-md transition-colors ${
            vista === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Grid3X3 className="h-4 w-4" />
        </button>
        <button
          onClick={() => onVista("lista")}
          className={`p-2 rounded-md transition-colors ${
            vista === "lista" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <List className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
