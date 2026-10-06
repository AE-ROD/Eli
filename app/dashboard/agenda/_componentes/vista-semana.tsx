"use client"

import { motion } from "framer-motion"
import { esHoy, duracionParaMostrar } from "@/lib/fechas"
import { diasSemana } from "./controles-de-agenda"
import { nombreDeCliente, type Cita } from "../_datos"

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

interface VistaSemanaProps {
  dias: Date[]
  citas: Cita[]
  onSeleccionar: (cita: Cita) => void
}

export function VistaSemana({ dias, citas, onSeleccionar }: VistaSemanaProps) {
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
        {dias.map((dia, indiceDia) => {
          const citasDelDia = citas.filter(
            (cita) => new Date(cita.startTime).toDateString() === dia.toDateString()
          )

          return (
            <div
              key={indiceDia}
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
                const inicio = new Date(cita.startTime)
                const hora = inicio.getHours()
                const minutos = inicio.getMinutes()
                if (hora < HORA_INICIO || hora >= HORA_FIN) return null
                const distanciaArriba = (hora - HORA_INICIO) * ALTURA_HORA + (minutos / 60) * ALTURA_HORA
                const duracion = duracionParaMostrar(cita.startTime, cita.endTime)
                const altura = Math.max((duracion / 60) * ALTURA_HORA - 4, 24)
                const claseDeColor = coloresEstado[cita.status] ?? coloresEstado.pendiente

                return (
                  <motion.button
                    key={cita.id}
                    className={`absolute left-1 right-1 rounded-lg border-l-2 px-1.5 py-1 text-left overflow-hidden ${claseDeColor}`}
                    style={{ top: distanciaArriba, height: altura }}
                    whileHover={{ scale: 1.02, zIndex: 10 }}
                    onClick={() => onSeleccionar(cita)}
                  >
                    <p className="text-xs font-medium truncate">{nombreDeCliente(cita)}</p>
                    {altura > 32 && (
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
