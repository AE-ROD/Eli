"use client"

import { TarjetaCita, type CitaEnTarjeta } from "@/components/panel/tarjeta-cita"
import { ESTADOS_DE_CITA } from "@/lib/campos-del-panel"
import { duracionParaMostrar } from "@/lib/fechas"
import type { FranjaDelDia } from "@/lib/horario-de-atencion"
import { aQuienBloquea, citaPorConfirmar, destacaSinProfesional, nombreDeCliente, type Bloqueo, type Cita } from "../_datos"
import { citasPorHora, rangoDeHoras, recortarAHoras, tramoDeCita, tramoEnElDia, tramosDeFranjas } from "../_disposicion"
import { caeEnElDia, horaEn } from "../_hora-del-negocio"
import { useZonaDelNegocio } from "./zona-del-negocio"

function paraTarjeta(cita: Cita, zona: string, conProfesionales: boolean): CitaEnTarjeta {
  const estado = (ESTADOS_DE_CITA as readonly string[]).includes(cita.status)
    ? (cita.status as CitaEnTarjeta["estado"])
    : "pendiente"
  return {
    id: cita.id,
    nombreCliente: nombreDeCliente(cita),
    servicio: cita.title,
    horaInicio: horaEn(cita.startTime, zona),
    horaFin: horaEn(cita.endTime, zona),
    duracion: duracionParaMostrar(cita.startTime, cita.endTime),
    estado,
    notas: cita.notes ?? undefined,
    porConfirmar: citaPorConfirmar(cita),
    sinProfesional: destacaSinProfesional(cita, conProfesionales),
  }
}

interface PropsDeVistaDia {
  fecha: Date
  citas: Cita[]
  /** El horario de atención del negocio, de toda la semana: amplía las horas que se dibujan. */
  horario: FranjaDelDia[]
  /** Bloqueos de horario: cada uno aparece en la hora en que empieza (o en la primera que se ve). */
  bloqueos: Bloqueo[]
  onSeleccionar: (cita: Cita) => void
  onSeleccionarBloqueo: (bloqueo: Bloqueo) => void
  /** Si hay profesionales a quien asignar: entonces las citas sin profesional se marcan (#103). */
  destacarSinProfesional?: boolean
}

/**
 * El día hora por hora: todas las citas que empiezan en cada hora, o el hueco.
 * Como mínimo de 8 a 20, ampliado para que entren el horario de atención de
 * ese día y cualquier cita fuera de ese rango (`rangoDeHoras`). Se desplaza
 * dentro de la tarjeta; el relleno deja lugar al anillo del foco de las
 * tarjetas, que esa caja recortaría.
 */
export function VistaDia({
  fecha,
  citas,
  horario,
  bloqueos,
  onSeleccionar,
  onSeleccionarBloqueo,
  destacarSinProfesional = false,
}: PropsDeVistaDia) {
  const zona = useZonaDelNegocio()
  // El día y las horas, en la zona del negocio (#99).
  const citasDelDia = citas.filter((cita) => caeEnElDia(cita.startTime, fecha, zona))
  const franjasDelDia = horario.filter((franja) => franja.dayOfWeek === fecha.getDay())
  const { desde, hasta } = rangoDeHoras([
    ...tramosDeFranjas(franjasDelDia),
    ...citasDelDia.map((cita) => tramoDeCita(cita, zona)),
  ])
  const horas = citasPorHora(citasDelDia, (cita) => tramoDeCita(cita, zona).inicioMin, desde, hasta)

  // Cada bloqueo, recortado al día y a las horas que se muestran.
  const bloqueosDelDia = bloqueos.flatMap((bloqueo) => {
    const enElDia = tramoEnElDia(bloqueo, fecha, zona)
    const visible = enElDia && recortarAHoras(enElDia, desde, hasta)
    return visible ? [{ bloqueo, ...visible }] : []
  })

  return (
    <ol className="max-h-[calc(100dvh-17.5rem)] min-h-96 space-y-2 overflow-y-auto px-3 pt-2.5 pb-4 sm:px-5 sm:pb-5">
      {horas.map(({ hora, citas: citasEnHora }) => {
        const etiqueta = `${String(hora).padStart(2, "0")}:00`
        const empiezanAca = bloqueosDelDia.filter(({ inicioMin }) => Math.floor(inicioMin / 60) === hora)
        const cubierta = bloqueosDelDia.some(({ inicioMin, finMin }) => inicioMin < (hora + 1) * 60 && finMin > hora * 60)
        return (
          <li key={hora} className="flex items-start gap-3">
            <span className="w-12 shrink-0 pt-3.5 text-right text-xs text-texto-2 tabular-nums">{etiqueta}</span>
            {citasEnHora.length > 0 || empiezanAca.length > 0 ? (
              <div className="min-w-0 flex-1 space-y-2">
                {empiezanAca.map(({ bloqueo }) => (
                  <button
                    key={bloqueo.id}
                    type="button"
                    onClick={() => onSeleccionarBloqueo(bloqueo)}
                    className="flex min-h-12 w-full items-center justify-between gap-3 rounded-[20px] border border-dashed border-texto-2/40 bg-borde/60 px-4 py-2 text-left text-sm text-texto-2 squircle anillo-foco"
                  >
                    <span className="min-w-0 break-words">
                      <span className="font-medium">Bloqueado</span>
                      {` · ${aQuienBloquea(bloqueo)}`}
                      {bloqueo.motivo && ` · ${bloqueo.motivo}`}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums">
                      {horaEn(bloqueo.startTime, zona)} – {horaEn(bloqueo.endTime, zona)}
                    </span>
                  </button>
                ))}
                {citasEnHora.map((cita) => (
                  <TarjetaCita key={cita.id} cita={paraTarjeta(cita, zona, destacarSinProfesional)} compacta onClick={() => onSeleccionar(cita)} />
                ))}
              </div>
            ) : cubierta ? (
              // Una hora del medio de un bloqueo: gris, sin texto; el bloqueo se lee en su primera hora.
              <div className="h-12 min-w-0 flex-1 rounded-[20px] bg-borde/60 squircle">
                <span className="sr-only">Bloqueado</span>
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
