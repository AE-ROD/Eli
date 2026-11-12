"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { cn } from "@/lib/utils"

interface PropsDeCasillaDeSeleccion {
  /** Su nombre para el lector de pantalla: qué se marca ("Seleccionar Corte"). La casilla no lleva texto a la vista. */
  etiqueta: string
  marcada: boolean
  /**
   * Marcada a medias: algunas de las filas de un grupo. Se ve como un guion y el
   * lector la anuncia "parcialmente marcada". Sólo vale si no está `marcada`.
   */
  algunas?: boolean
  deshabilitada?: boolean
  alCambiar: (marcada: boolean) => void
  className?: string
  /** Lo que va al lado: con él, la fila entera es la casilla (tocar el texto también marca). */
  children?: ReactNode
}

/**
 * La casilla para marcar una fila o un grupo de filas de una lista. El casillero
 * mide 20 px a la vista y el área que se toca, 44 × 44: lo mínimo para un dedo.
 * El foco lo dibuja el propio casillero (`anillo-foco`). Con `children`, el texto
 * de al lado es parte de la misma etiqueta: un clic en cualquier parte lo marca.
 */
export function CasillaDeSeleccion({
  etiqueta,
  marcada,
  algunas = false,
  deshabilitada = false,
  alCambiar,
  className,
  children,
}: PropsDeCasillaDeSeleccion) {
  const entrada = useRef<HTMLInputElement>(null)

  // `indeterminate` no es un atributo: sólo se pone desde el DOM.
  useEffect(() => {
    if (entrada.current) entrada.current.indeterminate = algunas && !marcada
  }, [algunas, marcada])

  return (
    <label
      className={cn(
        children ? "flex min-h-11 items-center gap-3" : "grid size-11 shrink-0 place-items-center rounded-[14px]",
        deshabilitada ? "cursor-not-allowed" : "cursor-pointer",
        className
      )}
    >
      <input
        ref={entrada}
        type="checkbox"
        aria-label={etiqueta}
        checked={marcada}
        disabled={deshabilitada}
        onChange={(evento) => alCambiar(evento.target.checked)}
        className={cn("anillo-foco size-5 shrink-0 accent-navy", deshabilitada ? "cursor-not-allowed" : "cursor-pointer")}
      />
      {children}
    </label>
  )
}
