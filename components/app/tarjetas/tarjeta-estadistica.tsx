"use client"

import { motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"

interface TarjetaEstadisticaProps {
  titulo: string
  valor: string | number
  icono: LucideIcon
  tendencia?: {
    valor: number
    esPositiva: boolean
  }
  colorIcono?: "primario" | "exito" | "advertencia" | "info"
}

const coloresIcono = {
  primario: "bg-primary/10 text-primary",
  exito: "bg-green-100 text-green-600",
  advertencia: "bg-amber-100 text-amber-600",
  info: "bg-blue-100 text-blue-600",
}

export function TarjetaEstadistica({
  titulo,
  valor,
  icono: Icono,
  tendencia,
  colorIcono = "primario",
}: TarjetaEstadisticaProps) {
  return (
    <motion.div
      className="bg-card border border-border/50 rounded-xl p-5 hover:shadow-md transition-shadow"
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{titulo}</p>
          <p className="text-2xl font-bold text-foreground">{valor}</p>
          {tendencia && (
            <p className={`text-xs font-medium ${tendencia.esPositiva ? "text-green-600" : "text-red-500"}`}>
              {tendencia.esPositiva ? "+" : "-"}{Math.abs(tendencia.valor)}% vs mes anterior
            </p>
          )}
        </div>
        <div className={`p-3 rounded-lg ${coloresIcono[colorIcono]}`}>
          <Icono className="h-5 w-5" />
        </div>
      </div>
    </motion.div>
  )
}
