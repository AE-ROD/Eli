"use client"

import { TarjetaCita, type Cita } from "@/components/eli/app/tarjeta-cita"
import type { CitaAPI } from "./panelDetalleCita"

const HORA_INICIO = 8
const HORA_FIN = 20

const horasDelDia = Array.from({ length: HORA_FIN - HORA_INICIO }, (_, i) =>
  `${(i + HORA_INICIO).toString().padStart(2, "0")}:00`
)

const estadosValidos = ["pendiente", "confirmada", "en-progreso", "completada", "cancelada"] as const

function formatHora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false })
}

function duracionMin(start: string, end: string) {
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000))
}

function mapearCita(c: CitaAPI): Cita {
  const estado = (estadosValidos as readonly string[]).includes(c.status)
    ? (c.status as Cita["estado"])
    : "pendiente"
  return {
    id: c.id,
    pacienteNombre: c.patient.name,
    servicio: c.title,
    horaInicio: formatHora(c.startTime),
    horaFin: formatHora(c.endTime),
    duracion: duracionMin(c.startTime, c.endTime),
    estado,
    notas: c.notes ?? undefined,
  }
}

interface VistaCalendarioDiaProps {
  fecha: Date
  citasAPI: CitaAPI[]
  onSeleccionar: (cita: CitaAPI) => void
}

export function VistaCalendarioDia({ fecha, citasAPI, onSeleccionar }: VistaCalendarioDiaProps) {
  const citasDelDia = citasAPI.filter((c) =>
    new Date(c.startTime).toDateString() === fecha.toDateString()
  )

  return (
    <div className="p-4 space-y-3 overflow-auto max-h-[calc(100vh-280px)]">
      {horasDelDia.map((hora) => {
        const citaEnHora = citasDelDia.find((c) =>
          new Date(c.startTime).getHours() === parseInt(hora.slice(0, 2))
        )
        return (
          <div key={hora} className="flex gap-4">
            <span className="text-sm text-muted-foreground w-16 flex-shrink-0 pt-2">{hora}</span>
            {citaEnHora ? (
              <div className="flex-1">
                <TarjetaCita
                  cita={mapearCita(citaEnHora)}
                  compacta
                  onClick={() => onSeleccionar(citaEnHora)}
                />
              </div>
            ) : (
              <div className="flex-1 h-12 border border-dashed border-border/50 rounded-lg hover:bg-muted/30 cursor-pointer transition-colors" />
            )}
          </div>
        )
      })}
    </div>
  )
}
