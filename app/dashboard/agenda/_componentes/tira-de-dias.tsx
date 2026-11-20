"use client"

import { diaParaLeer, diasDeLaSemanaDe } from "@/lib/fechas"
import { cn } from "@/lib/utils"
import { diasSemana } from "./controles-de-agenda"
import { esHoyEn } from "../_hora-del-negocio"
import { useZonaDelNegocio } from "./zona-del-negocio"

interface PropsDeTiraDeDias {
  fecha: Date
  onElegir: (dia: Date) => void
}

/** Si dos fechas son el mismo día del calendario. */
function mismoDia(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString()
}

/**
 * Los siete días de la semana del día que se mira, para pasar de uno a otro
 * con el pulgar (la vista Día del celular). El elegido va en navy y dice
 * `aria-pressed`; hoy dice "hoy" en vez del nombre del día, y lo mismo para el
 * lector de pantalla. Si no entran, la tira se desliza de costado.
 */
export function TiraDeDias({ fecha, onElegir }: PropsDeTiraDeDias) {
  const zona = useZonaDelNegocio()

  return (
    <div role="group" aria-label="Días de la semana" className="-mx-1 flex gap-1 overflow-x-auto px-1 py-1">
      {diasDeLaSemanaDe(fecha).map((dia) => {
        const elegido = mismoDia(dia, fecha)
        const hoy = esHoyEn(dia, zona)
        return (
          <button
            key={dia.toDateString()}
            type="button"
            aria-pressed={elegido}
            aria-label={`${diaParaLeer(dia)}${hoy ? ", hoy" : ""}`}
            onClick={() => onElegir(dia)}
            className={cn(
              "flex h-14 min-w-11 flex-1 flex-col items-center justify-center rounded-[14px] text-[11.5px] squircle anillo-foco",
              "transition-colors duration-150 ease-suave",
              elegido ? "bg-navy text-white/80" : "bg-superficie text-texto-2 hover:bg-borde",
              hoy && !elegido && "inset-ring-1 inset-ring-navy"
            )}
          >
            <span aria-hidden="true">{hoy ? "hoy" : diasSemana[dia.getDay()].toLowerCase()}</span>
            <span aria-hidden="true" className={cn("text-[17px] font-semibold tabular-nums", elegido ? "text-white" : "text-navy")}>
              {dia.getDate()}
            </span>
          </button>
        )
      })}
    </div>
  )
}
