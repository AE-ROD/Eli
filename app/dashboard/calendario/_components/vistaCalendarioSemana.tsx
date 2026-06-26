"use client"

import { motion } from "framer-motion"
import { diasSemana } from "./controlesCalendario"
import type { CitaAPI } from "./panelDetalleCita"

const HORA_INICIO = 8
const HORA_FIN = 20
const ALTURA_HORA = 64 // px por hora

const horasDelDia = Array.from({ length: HORA_FIN - HORA_INICIO }, (_, i) =>
  `${(i + HORA_INICIO).toString().padStart(2, "0")}:00`
)

const coloresEstado: Record<string, string> = {
  pendiente: "bg-amber-100 border-l-amber-500 text-amber-900",
  confirmada: "bg-green-100 border-l-green-500 text-green-900",
  "en-progreso": "bg-blue-100 border-l-blue-500 text-blue-900",
  completada: "bg-gray-100 border-l-gray-400 text-gray-700",
  cancelada: "bg-red-100 border-l-red-400 text-red-800 opacity-60",
}

function esHoy(fecha: Date) {
  return fecha.toDateString() === new Date().toDateString()
}

interface VistaCalendarioSemanaProps {
  dias: Date[]
  citasAPI: CitaAPI[]
  onSeleccionar: (cita: CitaAPI) => void
}

export function VistaCalendarioSemana({ dias, citasAPI, onSeleccionar }: VistaCalendarioSemanaProps) {
  return (
    <div className="overflow-auto max-h-[calc(100vh-280px)]">
      {/* Cabecera con días */}
      <div className="flex border-b border-border/50 sticky top-0 bg-card z-10">
        <div className="w-16 flex-shrink-0" />
        {dias.map((dia, i) => (
          <div
            key={i}
            className={`flex-1 p-3 text-center border-l border-border/50 ${esHoy(dia) ? "bg-primary/5" : ""}`}
          >
            <p className="text-xs font-medium text-muted-foreground">{diasSemana[dia.getDay()]}</p>
            <p
              className={`text-lg font-semibold mt-1 ${
                esHoy(dia)
                  ? "bg-primary text-primary-foreground w-8 h-8 rounded-full flex items-center justify-center mx-auto"
                  : "text-foreground"
              }`}
            >
              {dia.getDate()}
            </p>
          </div>
        ))}
      </div>

      {/* Grilla de horas con citas */}
      <div className="flex">
        {/* Columna de horas */}
        <div className="w-16 flex-shrink-0">
          {horasDelDia.map((hora) => (
            <div
              key={hora}
              style={{ height: ALTURA_HORA }}
              className="text-xs text-muted-foreground text-right pr-3 pt-1"
            >
              {hora}
            </div>
          ))}
        </div>

        {/* Columnas por día */}
        {dias.map((dia, diaIdx) => {
          const citasDelDia = citasAPI.filter((c) => {
            const f = new Date(c.startTime)
            return f.toDateString() === dia.toDateString()
          })

          return (
            <div
              key={diaIdx}
              className={`flex-1 relative border-l border-border/30 ${esHoy(dia) ? "bg-primary/5" : ""}`}
              style={{ height: ALTURA_HORA * (HORA_FIN - HORA_INICIO) }}
            >
              {/* Líneas de hora */}
              {horasDelDia.map((hora) => (
                <div
                  key={hora}
                  style={{ height: ALTURA_HORA }}
                  className="border-b border-border/20 hover:bg-muted/20 transition-colors cursor-pointer"
                />
              ))}

              {/* Citas */}
              {citasDelDia.map((cita) => {
                const start = new Date(cita.startTime)
                const hora = start.getHours()
                const min = start.getMinutes()
                if (hora < HORA_INICIO || hora >= HORA_FIN) return null
                const top = (hora - HORA_INICIO) * ALTURA_HORA + (min / 60) * ALTURA_HORA
                const durMin = Math.max(
                  1,
                  Math.round((new Date(cita.endTime).getTime() - start.getTime()) / 60000)
                )
                const height = Math.max((durMin / 60) * ALTURA_HORA - 4, 24)
                const colorClass = coloresEstado[cita.status] ?? coloresEstado.pendiente

                return (
                  <motion.button
                    key={cita.id}
                    className={`absolute left-1 right-1 rounded-lg border-l-2 px-1.5 py-1 text-left overflow-hidden ${colorClass}`}
                    style={{ top, height }}
                    whileHover={{ scale: 1.02, zIndex: 10 }}
                    onClick={() => onSeleccionar(cita)}
                  >
                    <div className="flex items-start gap-1">
                      <p className="min-w-0 flex-1 truncate text-xs font-medium">{cita.patient.name}</p>
                      {cita.isWalkIn && (
                        <span className="inline-flex items-center rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white shadow-sm">
                          W
                        </span>
                      )}
                    </div>
                    {height > 32 && (
                      <p className="text-xs opacity-70 truncate">{cita.title}</p>
                    )}
                  </motion.button>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
