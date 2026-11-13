"use client"

import { CampoHora } from "@/components/panel/campo-hora"
import { cn } from "@/lib/utils"

interface PropsDeRangoDeHoras {
  /** El nombre para el lector de pantalla ("Lunes", "Lunes, franja 2"): cada lista suma "desde" o "hasta". */
  etiqueta: string
  /** "HH:MM", en 24 h. */
  desde: string
  /** "HH:MM", en 24 h. */
  hasta: string
  alCambiarDesde: (valor: string) => void
  alCambiarHasta: (valor: string) => void
  /** El `id` de la lista de horas del "desde": a ella se lleva el foco (una franja recién agregada). */
  idDelDesde?: string
  className?: string
}

/**
 * De qué hora a qué hora: dos `CampoHora` con "hasta" en el medio. Es la franja
 * de un día del horario semanal: la usan "Horario" (una franja por día) y
 * "Sedes y horarios" (una o más). En el teléfono las dos horas se reparten el
 * ancho; desde `sm` cada una mide 160 px.
 */
export function RangoDeHoras({
  etiqueta,
  desde,
  hasta,
  alCambiarDesde,
  alCambiarHasta,
  idDelDesde,
  className,
}: PropsDeRangoDeHoras) {
  return (
    <div className={cn("flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1", className)}>
      <CampoHora
        id={idDelDesde}
        etiqueta={`${etiqueta}: desde`}
        value={desde}
        onChange={alCambiarDesde}
        className="min-w-0 flex-1 sm:w-40 sm:flex-none"
      />
      <span className="shrink-0 text-sm text-texto-2">hasta</span>
      <CampoHora
        etiqueta={`${etiqueta}: hasta`}
        value={hasta}
        onChange={alCambiarHasta}
        className="min-w-0 flex-1 sm:w-40 sm:flex-none"
      />
    </div>
  )
}
