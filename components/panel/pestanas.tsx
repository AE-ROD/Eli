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
  /** Base de los ids de las pestañas y de sus paneles. */
  idBase: string
  /** Qué elige quien usa las pestañas ("Cómo cargarlos"): el nombre de la lista. */
  etiqueta: string
  pestanas: readonly Pestana<Id>[]
  activa: Id
  alCambiar: (id: Id) => void
  className?: string
}

/**
 * Pestañas dentro de un diálogo o una tarjeta, con el patrón de pestañas de
 * ARIA: Tab entra sólo a la elegida, las flechas pasan de una a otra (Inicio y
 * Fin, a las puntas) y la elegida recibe el foco al moverse. Cada pestaña
 * apunta a su panel con `aria-controls` (`idDePanel`) y el panel se nombra con
 * la pestaña (`aria-labelledby={idDePestana(...)}`).
 *
 * Una píldora gris con las pestañas adentro; la elegida, en navy y en
 * negrita: no sólo por el color. Cada una mide 40 px y el `::after` la lleva a
 * 44 para el dedo. Si no entran, la fila se desplaza de lado dentro de su píldora.
 */
export function Pestanas<Id extends string>({ idBase, etiqueta, pestanas, activa, alCambiar, className }: PropsDePestanas<Id>) {
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
      className={cn("flex max-w-full gap-1 overflow-x-auto rounded-full bg-superficie p-1", className)}
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
              "relative h-10 shrink-0 rounded-full px-4 text-sm whitespace-nowrap anillo-foco after:absolute after:inset-x-0 after:-inset-y-0.5 sm:px-5",
              "transition-colors duration-150 ease-suave",
              elegida ? "bg-navy font-semibold text-white" : "font-medium text-texto-2 hover:bg-tarjeta hover:text-navy"
            )}
          >
            {texto}
          </button>
        )
      })}
    </div>
  )
}
