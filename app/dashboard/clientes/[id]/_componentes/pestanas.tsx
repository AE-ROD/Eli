"use client"

import { useRef, type KeyboardEvent } from "react"
import { cn } from "@/lib/utils"

export interface Pestana<Id extends string> {
  id: Id
  texto: string
}

/** El id de una pestaña y el de su panel: el panel nombra a su pestaña en `aria-labelledby`. */
export const idDePestana = (idBase: string, id: string) => `${idBase}-pestana-${id}`
export const idDePanel = (idBase: string, id: string) => `${idBase}-panel-${id}`

interface PropsDePestanas<Id extends string> {
  idBase: string
  etiqueta: string
  pestanas: readonly Pestana<Id>[]
  activa: Id
  alCambiar: (id: Id) => void
}

/**
 * Las secciones de la ficha como pestañas (patrón de pestañas de ARIA, como
 * `SelectorDeVista` de reportes): Tab entra sólo a la elegida, las flechas
 * pasan de una a otra (Inicio y Fin, a las puntas) y la elegida se muestra
 * al moverse. La elegida va en el lila de Clientes y en negrita: no sólo por
 * el color.
 *
 * Cada pestaña mide 40px; el `::after` la lleva a 44 para el dedo. En el
 * teléfono la fila se desplaza de lado si no entra, dentro de su píldora.
 */
export function Pestanas<Id extends string>({ idBase, etiqueta, pestanas, activa, alCambiar }: PropsDePestanas<Id>) {
  const lista = useRef<HTMLDivElement>(null)

  const elegir = (id: Id) => {
    alCambiar(id)
    lista.current?.querySelector<HTMLElement>(`#${CSS.escape(idDePestana(idBase, id))}`)?.focus()
  }

  const alTeclear = (evento: KeyboardEvent<HTMLDivElement>) => {
    const actual = pestanas.findIndex((pestana) => pestana.id === activa)
    const destino =
      evento.key === "ArrowRight"
        ? pestanas[(actual + 1) % pestanas.length]
        : evento.key === "ArrowLeft"
          ? pestanas[(actual - 1 + pestanas.length) % pestanas.length]
          : evento.key === "Home"
            ? pestanas[0]
            : evento.key === "End"
              ? pestanas[pestanas.length - 1]
              : null
    if (!destino) return
    evento.preventDefault()
    elegir(destino.id)
  }

  return (
    <div
      ref={lista}
      role="tablist"
      aria-label={etiqueta}
      onKeyDown={alTeclear}
      className="flex max-w-full gap-1 overflow-x-auto rounded-[18px] bg-tarjeta p-1 shadow-sm squircle sm:w-fit"
    >
      {pestanas.map(({ id, texto }) => {
        const elegida = activa === id
        return (
          <button
            key={id}
            id={idDePestana(idBase, id)}
            type="button"
            role="tab"
            aria-selected={elegida}
            aria-controls={idDePanel(idBase, id)}
            tabIndex={elegida ? 0 : -1}
            onClick={() => elegir(id)}
            className={cn(
              "relative h-10 shrink-0 rounded-[14px] px-4 text-[15px] whitespace-nowrap squircle anillo-foco after:absolute after:inset-x-0 after:-inset-y-0.5",
              "transition-colors duration-150 ease-suave",
              elegida ? "bg-lila-suave font-semibold text-navy" : "font-medium text-navy hover:bg-superficie"
            )}
          >
            {texto}
          </button>
        )
      })}
    </div>
  )
}
