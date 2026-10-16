"use client"

import { useRef, type KeyboardEvent } from "react"
import { cn } from "@/lib/utils"

export type VistaDeReporte = "cobradas" | "anuladas"

const VISTAS: { id: VistaDeReporte; texto: string }[] = [
  { id: "cobradas", texto: "Cobradas" },
  { id: "anuladas", texto: "Anuladas" },
]

/** El id de la pestaña de cada vista: el panel lo nombra en `aria-labelledby`. */
export const idDePestaña = (idBase: string, vista: VistaDeReporte) => `${idBase}-pestana-${vista}`

interface SelectorDeVistaProps {
  /** Base de los ids de las pestañas y del panel. */
  idBase: string
  idDelPanel: string
  vista: VistaDeReporte
  onCambiar: (vista: VistaDeReporte) => void
}

/**
 * Lo cobrado o lo anulado, como pestañas (patrón de pestañas de ARIA): con
 * las flechas se pasa de una a otra, y Tab entra sólo a la elegida. Lo ve
 * sólo quien puede ver lo anulado (`puedeVerAnuladas`).
 *
 * Una píldora blanca con las dos pestañas adentro; la elegida, en navy, como
 * los segmentos de los formularios. Cada pestaña mide 40 px y el `::after` la
 * lleva a 44 para el dedo.
 */
export function SelectorDeVista({ idBase, idDelPanel, vista, onCambiar }: SelectorDeVistaProps) {
  const lista = useRef<HTMLDivElement>(null)

  const elegir = (otra: VistaDeReporte) => {
    onCambiar(otra)
    lista.current?.querySelector<HTMLElement>(`#${CSS.escape(idDePestaña(idBase, otra))}`)?.focus()
  }

  const alTeclear = (evento: KeyboardEvent<HTMLDivElement>) => {
    const actual = VISTAS.findIndex((candidata) => candidata.id === vista)
    const destino =
      evento.key === "ArrowRight"
        ? VISTAS[(actual + 1) % VISTAS.length]
        : evento.key === "ArrowLeft"
          ? VISTAS[(actual - 1 + VISTAS.length) % VISTAS.length]
          : evento.key === "Home"
            ? VISTAS[0]
            : evento.key === "End"
              ? VISTAS[VISTAS.length - 1]
              : null
    if (!destino) return
    evento.preventDefault()
    elegir(destino.id)
  }

  return (
    <div
      ref={lista}
      role="tablist"
      aria-label="Qué mirar"
      onKeyDown={alTeclear}
      className="inline-flex gap-1 rounded-full bg-tarjeta p-1 shadow-sm"
    >
      {VISTAS.map(({ id, texto }) => {
        const elegida = vista === id
        return (
          <button
            key={id}
            id={idDePestaña(idBase, id)}
            type="button"
            role="tab"
            aria-selected={elegida}
            aria-controls={idDelPanel}
            tabIndex={elegida ? 0 : -1}
            onClick={() => elegir(id)}
            className={cn(
              "relative h-10 rounded-full px-5 text-sm font-medium anillo-foco after:absolute after:inset-x-0 after:-inset-y-0.5",
              "transition-colors duration-150 ease-suave",
              elegida ? "bg-navy text-white" : "text-texto-2 hover:bg-superficie hover:text-navy"
            )}
          >
            {texto}
          </button>
        )
      })}
    </div>
  )
}
