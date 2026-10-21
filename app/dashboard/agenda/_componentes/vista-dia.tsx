"use client"

import { TarjetaCita, type CitaEnTarjeta } from "@/components/panel/tarjeta-cita"
import { formatearHora, duracionParaMostrar, horasEnPunto } from "@/lib/fechas"
import { nombreDeCliente, type Cita } from "../_datos"

const HORA_INICIO = 8
const HORA_FIN = 20

const horasDelDia = horasEnPunto(HORA_INICIO, HORA_FIN)

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

interface PropsDeVistaDia {
  fecha: Date
  citas: Cita[]
  onSeleccionar: (cita: Cita) => void
}

/**
 * El día hora por hora, de 8 a 20: la cita de cada hora, o el hueco. Se
 * desplaza dentro de la tarjeta; el relleno deja lugar al anillo del foco de
 * las tarjetas, que esa caja recortaría.
 */
export function VistaDia({ fecha, citas, onSeleccionar }: PropsDeVistaDia) {
  const citasDelDia = citas.filter((cita) =>
    new Date(cita.startTime).toDateString() === fecha.toDateString()
  )

  return (
    <ol className="max-h-[calc(100dvh-17.5rem)] min-h-96 space-y-2 overflow-y-auto px-3 pt-2.5 pb-4 sm:px-5 sm:pb-5">
      {horasDelDia.map((hora) => {
        const citaEnHora = citasDelDia.find((cita) =>
          new Date(cita.startTime).getHours() === parseInt(hora.slice(0, 2))
        )
        return (
          <li key={hora} className="flex items-start gap-3">
            <span className="w-12 shrink-0 pt-3.5 text-right text-xs text-texto-2 tabular-nums">{hora}</span>
            {citaEnHora ? (
              <div className="min-w-0 flex-1">
                <TarjetaCita
                  cita={paraTarjeta(citaEnHora)}
                  compacta
                  onClick={() => onSeleccionar(citaEnHora)}
                />
              </div>
            ) : (
              // El hueco no se toca: sólo marca que esa hora está libre.
              <div className="h-12 min-w-0 flex-1 rounded-[20px] border-[1.5px] border-dashed border-borde squircle">
                <span className="sr-only">Libre</span>
              </div>
            )}
          </li>
        )
      })}
    </ol>
  )
}
