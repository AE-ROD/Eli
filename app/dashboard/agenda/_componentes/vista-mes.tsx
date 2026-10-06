"use client"

import { motion } from "framer-motion"
import { esHoy } from "@/lib/fechas"
import { diasSemana } from "./controles-de-agenda"
import type { Cita } from "../_datos"

const coloresPunto: Record<string, string> = {
  pendiente: "bg-amber-400",
  confirmada: "bg-green-500",
  "en-progreso": "bg-blue-500",
  completada: "bg-gray-400",
  cancelada: "bg-red-400",
}

interface VistaMesProps {
  fechaActual: Date
  citas: Cita[]
  onDiaClick: (fecha: Date) => void
}

export function VistaMes({ fechaActual, citas, onDiaClick }: VistaMesProps) {
  const primerDia = new Date(fechaActual.getFullYear(), fechaActual.getMonth(), 1)
  // Cuántas celdas de la grilla quedan antes del día 1: la semana empieza en domingo.
  const celdasAntesDelPrimero = primerDia.getDay()
  const totalCeldas = 42

  return (
    <div className="p-4">
      {/* Cabecera días semana */}
      <div className="grid grid-cols-7 mb-2">
        {diasSemana.map((dia) => (
          <div key={dia} className="p-2 text-center text-sm font-medium text-muted-foreground">
            {dia}
          </div>
        ))}
      </div>

      {/* Celdas del mes */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: totalCeldas }, (_, i) => {
          const diaNum = i - celdasAntesDelPrimero + 1
          const fecha = new Date(fechaActual.getFullYear(), fechaActual.getMonth(), diaNum)
          const esDelMes = fecha.getMonth() === fechaActual.getMonth() && diaNum > 0

          const citasDelDia = esDelMes
            ? citas.filter((cita) => new Date(cita.startTime).toDateString() === fecha.toDateString())
            : []

          return (
            <motion.div
              key={i}
              className={`aspect-square p-1.5 rounded-lg cursor-pointer transition-colors flex flex-col ${
                esDelMes ? "hover:bg-muted" : "opacity-20 pointer-events-none"
              } ${esHoy(fecha) ? "bg-primary/10 ring-2 ring-primary" : ""}`}
              whileHover={esDelMes ? { scale: 1.05 } : {}}
              onClick={() => esDelMes && onDiaClick(fecha)}
            >
              <span className={`text-sm ${esDelMes ? "text-foreground" : "text-muted-foreground"}`}>
                {esDelMes ? diaNum : ""}
              </span>
              {citasDelDia.length > 0 && (
                <div className="flex flex-wrap gap-0.5 mt-auto">
                  {citasDelDia.slice(0, 3).map((cita) => (
                    <div
                      key={cita.id}
                      className={`w-1.5 h-1.5 rounded-full ${coloresPunto[cita.status] ?? "bg-primary"}`}
                    />
                  ))}
                  {citasDelDia.length > 3 && (
                    <span className="text-xs text-muted-foreground">+{citasDelDia.length - 3}</span>
                  )}
                </div>
              )}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
