"use client"

import { useId, type ReactNode } from "react"
import { ChevronDown, Tag } from "lucide-react"
import { CasillaDeSeleccion } from "@/components/panel/casilla-de-seleccion"
import { cn } from "@/lib/utils"
import type { EstadoDeLaSeleccion } from "@/lib/seleccion-multiple"

interface PropsDeGrupoDeServicios {
  /** Como se muestra: la categoría, o "Sin categoría". */
  nombre: string
  /** "12 servicios": el conteo que lee el lector de pantalla. */
  conteoEnPalabras: string
  /** El número de la insignia. */
  cantidad: number
  abierto: boolean
  alAlternar: () => void
  /** Mientras se eligen servicios: la casilla de la categoría entera y su estado. */
  seleccion?: { etiqueta: string; estado: EstadoDeLaSeleccion; alCambiar: (marcado: boolean) => void }
  /** "Renombrar categoría" (no en "Sin categoría" ni mientras se selecciona). */
  renombrar?: { etiqueta: string; texto: string; alPulsar: () => void }
  children: ReactNode
}

/**
 * Una categoría de la lista de servicios con su título plegable y el conteo.
 * El título es un botón con `aria-expanded` dentro de un encabezado (patrón
 * de acordeón de ARIA): Enter o Espacio pliega y despliega. Cada acción mide
 * 44 px de alto.
 */
export function GrupoDeServicios({ nombre, conteoEnPalabras, cantidad, abierto, alAlternar, seleccion, renombrar, children }: PropsDeGrupoDeServicios) {
  const idDeLaLista = useId()

  return (
    <section>
      <div className="flex items-center gap-1 rounded-[16px] bg-superficie pr-1 pl-1 squircle">
        {seleccion && (
          <CasillaDeSeleccion
            etiqueta={seleccion.etiqueta}
            marcada={seleccion.estado === "todos"}
            algunas={seleccion.estado === "algunos"}
            alCambiar={seleccion.alCambiar}
          />
        )}
        <h4 className="min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={abierto}
            aria-controls={idDeLaLista}
            onClick={alAlternar}
            className="flex min-h-11 w-full items-center gap-2 rounded-[14px] px-2 text-left anillo-foco"
          >
            <ChevronDown
              className={cn("size-4 shrink-0 transition-transform duration-150 ease-suave", !abierto && "-rotate-90")}
              aria-hidden="true"
              strokeWidth={2}
            />
            <span className="font-medium break-words">{nombre}</span>
            <span
              aria-hidden="true"
              className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-tarjeta px-2 text-xs font-medium tabular-nums"
            >
              {cantidad}
            </span>
            <span className="sr-only">, {conteoEnPalabras}</span>
          </button>
        </h4>
        {renombrar && (
          <button
            type="button"
            onClick={renombrar.alPulsar}
            aria-label={renombrar.etiqueta}
            title={renombrar.texto}
            className="inline-flex size-11 shrink-0 items-center justify-center gap-1.5 rounded-[14px] text-sm font-medium text-navy squircle anillo-foco transition-colors duration-150 ease-suave hover:bg-tarjeta sm:w-auto sm:px-3"
          >
            <Tag className="size-4" aria-hidden="true" strokeWidth={1.75} />
            <span className="hidden sm:inline">{renombrar.texto}</span>
          </button>
        )}
      </div>
      {/* Plegada se esconde, no se quita: `aria-controls` sigue apuntando a algo que existe. */}
      <ul id={idDeLaLista} hidden={!abierto} className="mt-1 divide-y divide-borde px-2">
        {children}
      </ul>
    </section>
  )
}
