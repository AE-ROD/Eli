"use client"

import { TarjetaCita, type CitaEnTarjeta } from "@/components/panel/tarjeta-cita"
import { formatearHora, duracionParaMostrar } from "@/lib/fechas"
import type { FranjaDelDia } from "@/lib/horario-de-atencion"
import { nombreDeCliente, type Cita } from "../_datos"
import { citasPorHora, rangoDeHoras, tramoDeCita, tramosDeFranjas } from "../_disposicion"

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
  /** El horario de atención del negocio, de toda la semana: amplía las horas que se dibujan. */
  horario: FranjaDelDia[]
  onSeleccionar: (cita: Cita) => void
}

/**
 * El día hora por hora: todas las citas que empiezan en cada hora, o el hueco.
 * Como mínimo de 8 a 20, ampliado para que entren el horario de atención de
 * ese día y cualquier cita fuera de ese rango (`rangoDeHoras`). Se desplaza
 * dentro de la tarjeta; el relleno deja lugar al anillo del foco de las
 * tarjetas, que esa caja recortaría.
 */
export function VistaDia({ fecha, citas, horario, onSeleccionar }: PropsDeVistaDia) {
  const citasDelDia = citas.filter((cita) =>
    new Date(cita.startTime).toDateString() === fecha.toDateString()
  )
  const franjasDelDia = horario.filter((franja) => franja.dayOfWeek === fecha.getDay())
  const { desde, hasta } = rangoDeHoras([...tramosDeFranjas(franjasDelDia), ...citasDelDia.map(tramoDeCita)])
  const horas = citasPorHora(citasDelDia, (cita) => tramoDeCita(cita).inicioMin, desde, hasta)

  return (
    <ol className="max-h-[calc(100dvh-17.5rem)] min-h-96 space-y-2 overflow-y-auto px-3 pt-2.5 pb-4 sm:px-5 sm:pb-5">
      {horas.map(({ hora, citas: citasEnHora }) => {
        const etiqueta = `${String(hora).padStart(2, "0")}:00`
        return (
          <li key={hora} className="flex items-start gap-3">
            <span className="w-12 shrink-0 pt-3.5 text-right text-xs text-texto-2 tabular-nums">{etiqueta}</span>
            {citasEnHora.length > 0 ? (
              <div className="min-w-0 flex-1 space-y-2">
                {citasEnHora.map((cita) => (
                  <TarjetaCita key={cita.id} cita={paraTarjeta(cita)} compacta onClick={() => onSeleccionar(cita)} />
                ))}
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
