"use client"

import { motion } from "framer-motion"
import { Clock, DollarSign } from "lucide-react"
import { formatearDuracionDeServicio } from "@/lib/fechas"

export interface ServicioPublico {
  id: string
  name: string
  description: string | null
  duration: number
  price: number | null
}

interface SelectorServicioProps {
  servicios: ServicioPublico[]
  seleccionado: ServicioPublico | null
  onSeleccionar: (servicio: ServicioPublico) => void
}

export function SelectorServicio({ servicios, seleccionado, onSeleccionar }: SelectorServicioProps) {
  return (
    <div className="grid gap-3">
      {servicios.map((servicio) => (
        <motion.button
          key={servicio.id}
          type="button"
          onClick={() => onSeleccionar(servicio)}
          className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
            seleccionado?.id === servicio.id
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/40 hover:bg-muted/50"
          }`}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground">{servicio.name}</p>
              {servicio.description && (
                <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{servicio.description}</p>
              )}
            </div>
            {seleccionado?.id === servicio.id && (
              <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-primary-foreground text-xs">✓</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 mt-3">
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              {formatearDuracionDeServicio(servicio.duration)}
            </span>
            {servicio.price != null && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <DollarSign className="h-4 w-4 text-muted-foreground" />
                {servicio.price.toLocaleString("es-ES")}
              </span>
            )}
          </div>
        </motion.button>
      ))}
    </div>
  )
}
