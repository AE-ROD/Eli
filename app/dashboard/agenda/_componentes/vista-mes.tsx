"use client"

import { esHoy, diaParaLeer } from "@/lib/fechas"
import { cn } from "@/lib/utils"
import { diasSemana } from "./controles-de-agenda"
import type { Cita } from "../_datos"

const cuantasCitas = (cantidad: number) => (cantidad === 1 ? "1 cita" : `${cantidad} citas`)

interface VistaMesProps {
  fechaActual: Date
  citas: Cita[]
  onElegirDia: (fecha: Date) => void
}

/**
 * El mes en una grilla: cada día es un botón que abre ese día. Dice cuántas
 * citas tiene, no cuáles: para eso está el día.
 *
 * Mide su propio ancho (`@container`) y no el de la ventana: con el detalle de
 * una cita abierto al lado, la tarjeta se angosta aunque la pantalla sea
 * ancha. Angosta, cada día es un cuadro de 44 px (lo mínimo para un dedo) con
 * un punto si hay citas, como el calendario del teléfono; ancha, cada día es
 * una baldosa gris con el número arriba y la cantidad escrita abajo, y la de
 * hoy, en el azul de la Agenda.
 */
export function VistaMes({ fechaActual, citas, onElegirDia }: VistaMesProps) {
  const primerDia = new Date(fechaActual.getFullYear(), fechaActual.getMonth(), 1)
  // Cuántas celdas de la grilla quedan antes del día 1: la semana empieza en domingo.
  const celdasAntesDelPrimero = primerDia.getDay()
  const totalCeldas = 42

  return (
    <div className="@container px-2 pb-3 sm:px-4 sm:pb-4">
      {/* Cabecera: cada día ya dice su nombre entero, así que no se lee. */}
      <div aria-hidden="true" className="grid grid-cols-7 pb-1 text-center text-xs font-medium text-texto-2 @lg:gap-1 @lg:text-left">
        {diasSemana.map((dia) => (
          <span key={dia} className="py-2 @lg:px-2.5">
            {dia}
          </span>
        ))}
      </div>

      {/* Celdas del mes */}
      <div className="grid grid-cols-7 @lg:gap-1">
        {Array.from({ length: totalCeldas }, (_, i) => {
          const diaNum = i - celdasAntesDelPrimero + 1
          const fecha = new Date(fechaActual.getFullYear(), fechaActual.getMonth(), diaNum)
          const esDelMes = fecha.getMonth() === fechaActual.getMonth() && diaNum > 0

          // Las celdas de otros meses guardan su lugar: la grilla tiene siempre seis filas y no salta.
          if (!esDelMes) return <span key={i} aria-hidden="true" className="min-h-11 @lg:min-h-24" />

          const citasDelDia = citas.filter((cita) => new Date(cita.startTime).toDateString() === fecha.toDateString())
          const hoy = esHoy(fecha)

          return (
            <button
              key={i}
              type="button"
              onClick={() => onElegirDia(fecha)}
              aria-label={`${diaParaLeer(fecha)}, ${citasDelDia.length > 0 ? cuantasCitas(citasDelDia.length) : "sin citas"}`}
              aria-current={hoy ? "date" : undefined}
              className={cn(
                "flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-campo p-1 text-navy squircle",
                "anillo-foco transition-colors duration-150 ease-suave hover:bg-superficie",
                "@lg:min-h-24 @lg:items-start @lg:justify-between @lg:p-2 @lg:hover:bg-azul-suave",
                hoy ? "@lg:bg-azul-suave/60" : "@lg:bg-superficie"
              )}
            >
              {/* Hoy, en un círculo navy: se distingue sin depender del color. */}
              <span
                className={cn(
                  "grid size-7 place-items-center rounded-full text-sm tabular-nums",
                  hoy ? "bg-navy font-semibold text-white" : "font-medium"
                )}
              >
                {diaNum}
              </span>
              {citasDelDia.length > 0 && (
                <>
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-navy @lg:hidden" />
                  <span className="hidden h-6 max-w-full truncate rounded-full bg-tarjeta px-2 text-xs leading-6 font-medium tabular-nums @lg:inline-block">
                    {cuantasCitas(citasDelDia.length)}
                  </span>
                </>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
