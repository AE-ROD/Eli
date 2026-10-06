"use client"

import { TarjetaCita, type CitaEnTarjeta } from "@/components/panel/tarjeta-cita"
import { formatearHora, duracionParaMostrar } from "@/lib/fechas"
import { nombreDeCliente, type Cita } from "../_datos"

const HORA_INICIO = 8
const HORA_FIN = 20

const horasDelDia = Array.from({ length: HORA_FIN - HORA_INICIO }, (_, i) =>
  `${(i + HORA_INICIO).toString().padStart(2, "0")}:00`
)

const estadosValidos = ["pendiente", "confirmada", "en-progreso", "completada", "cancelada"] as const

function paraTarjeta(cita: Cita): CitaEnTarjeta {
  const estado = (estadosValidos as readonly string[]).includes(cita.status)
    ? (cita.status as CitaEnTarjeta["estado"])
    : "pendiente"
  return {
    id: cita.id,
    nombreCliente: nombreDeCliente(cita),
    servicio: cita.title,
    horaInicio: formatearHora(cita.startTime),
    horaFin: formatearHora(cita.endTime),
    duracion: duracionParaMostrar(cita.startTime, cita.endTime),
    estado,
    notas: cita.notes ?? undefined,
  }
}

interface VistaDiaProps {
  fecha: Date
  citas: Cita[]
  onSeleccionar: (cita: Cita) => void
}

export function VistaDia({ fecha, citas, onSeleccionar }: VistaDiaProps) {
  const citasDelDia = citas.filter((cita) =>
    new Date(cita.startTime).toDateString() === fecha.toDateString()
  )

  return (
    <div className="p-4 space-y-3 overflow-auto max-h-[calc(100vh-280px)]">
      {horasDelDia.map((hora) => {
        const citaEnHora = citasDelDia.find((cita) =>
          new Date(cita.startTime).getHours() === parseInt(hora.slice(0, 2))
        )
        return (
          <div key={hora} className="flex gap-4">
            <span className="text-sm text-muted-foreground w-16 flex-shrink-0 pt-2">{hora}</span>
            {citaEnHora ? (
              <div className="flex-1">
                <TarjetaCita
                  cita={paraTarjeta(citaEnHora)}
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
