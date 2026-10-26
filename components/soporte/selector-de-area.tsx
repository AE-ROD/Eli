"use client"

import { Check } from "lucide-react"
import { FONDO_SUAVE } from "@/components/comunes/colores-de-modulo"
import { IconoDeArea, moduloDelArea } from "@/components/soporte/icono-de-area"
import { moduloPorId } from "@/lib/modulos"
import { AREAS, type AreaDeSoporte } from "@/lib/soporte"
import { cn } from "@/lib/utils"

/** El fondo de un área elegida: el pastel suave de su módulo, o el gris de superficie. */
export function fondoDelArea(area: AreaDeSoporte): string {
  const modulo = moduloDelArea(area)
  return modulo ? FONDO_SUAVE[moduloPorId(modulo).color] : "bg-superficie"
}

interface PropsDeSelectorDeArea {
  elegida: AreaDeSoporte | null
  alElegir: (area: AreaDeSoporte) => void
  /** Lo que nombra al grupo para el lector de pantalla: el título del paso. */
  idDelTitulo: string
}

/**
 * Las áreas de Eli como tiles grandes, de a dos en el teléfono y de a cuatro
 * desde sm. Tocar una la elige y pasa al paso siguiente; si se vuelve atrás,
 * la elegida queda marcada (`aria-pressed`).
 */
export function SelectorDeArea({ elegida, alElegir, idDelTitulo }: PropsDeSelectorDeArea) {
  return (
    <ul role="list" aria-labelledby={idDelTitulo} className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
      {AREAS.map((area) => {
        const activa = elegida === area.valor
        return (
          <li key={area.valor}>
            <button
              type="button"
              aria-pressed={activa}
              onClick={() => alElegir(area.valor)}
              className={cn(
                "group relative flex h-full min-h-28 w-full flex-col items-start justify-between gap-3 rounded-[24px] border-[1.5px] p-4 text-left shadow-sm squircle anillo-foco",
                "transition-[box-shadow,translate,background-color] duration-200 ease-suave hover:-translate-y-0.5 hover:shadow-md",
                activa ? cn("border-navy", fondoDelArea(area.valor)) : "border-transparent bg-tarjeta"
              )}
            >
              <IconoDeArea area={area.valor} activo={activa} />
              <span className="font-medium text-pretty text-navy">{area.etiqueta}</span>
              {activa && (
                <Check aria-hidden="true" className="absolute top-4 right-4 size-5 text-navy" strokeWidth={2} />
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

interface PropsDeFiltroDeAreas {
  /** `null` es "Todas". */
  elegida: AreaDeSoporte | null
  alElegir: (area: AreaDeSoporte | null) => void
}

const CHIP =
  "inline-flex h-11 shrink-0 items-center gap-2 rounded-full border-[1.5px] pr-4 pl-1.5 text-sm font-medium text-navy anillo-foco transition-[background-color,border-color] duration-150 ease-suave"

/**
 * El filtro por área de las preguntas frecuentes: píldoras que se apilan en
 * renglones (nada queda escondido detrás de un desplazamiento lateral). Cada
 * una es un botón con `aria-pressed`; "Todas" quita el filtro.
 */
export function FiltroDeAreas({ elegida, alElegir }: PropsDeFiltroDeAreas) {
  return (
    <div role="group" aria-label="Filtrar por área" className="flex flex-wrap gap-2">
      <button
        type="button"
        aria-pressed={elegida === null}
        onClick={() => alElegir(null)}
        className={cn(
          CHIP,
          "pl-4",
          elegida === null ? "border-navy bg-navy text-white" : "border-transparent bg-tarjeta shadow-sm hover:bg-superficie"
        )}
      >
        Todas
      </button>
      {AREAS.map((area) => {
        const activa = elegida === area.valor
        return (
          <button
            key={area.valor}
            type="button"
            aria-pressed={activa}
            onClick={() => alElegir(activa ? null : area.valor)}
            className={cn(
              CHIP,
              activa ? cn("border-navy", fondoDelArea(area.valor)) : "border-transparent bg-tarjeta shadow-sm hover:bg-superficie"
            )}
          >
            <IconoDeArea area={area.valor} tamano="sm" activo={activa} className="size-8" />
            {area.etiqueta}
          </button>
        )
      })}
    </div>
  )
}
