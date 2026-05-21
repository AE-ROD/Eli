"use client"

import { motion } from "framer-motion"
import { diasSemana } from "./controlesCalendario"
import type { CitaAPI } from "./panelDetalleCita"

const coloresPunto: Record<string, string> = {
  pendiente: "bg-amber-400",
  confirmada: "bg-green-500",
  "en-progreso": "bg-blue-500",
  completada: "bg-gray-400",
  cancelada: "bg-red-400",
}

function esHoy(fecha: Date) {
  return fecha.toDateString() === new Date().toDateString()
}

interface VistaCalendarioMesProps {
  fechaActual: Date
  citasAPI: CitaAPI[]
  onDiaClick: (fecha: Date) => void
}

export function VistaCalendarioMes({ fechaActual, citasAPI, onDiaClick }: VistaCalendarioMesProps) {
  const primerDia = new Date(fechaActual.getFullYear(), fechaActual.getMonth(), 1)
  const offset = primerDia.getDay()
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
          const diaNum = i - offset + 1
          const fecha = new Date(fechaActual.getFullYear(), fechaActual.getMonth(), diaNum)
          const esDelMes = fecha.getMonth() === fechaActual.getMonth() && diaNum > 0

          const citasDelDia = esDelMes
            ? citasAPI.filter((c) => new Date(c.startTime).toDateString() === fecha.toDateString())
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
                  {citasDelDia.slice(0, 3).map((c) => (
                    <div
                      key={c.id}
                      className={`w-1.5 h-1.5 rounded-full ${coloresPunto[c.status] ?? "bg-primary"}`}
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
