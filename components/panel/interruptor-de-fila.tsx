"use client"

import { cn } from "@/lib/utils"

interface PropsDeInterruptorDeFila {
  activo: boolean
  /** Su nombre accesible, con lo que cambia: "Sede activa: Providencia". La fila ya muestra el nombre a la vista. */
  etiqueta: string
  alCambiar: () => void
  disabled?: boolean
  className?: string
}

/**
 * Un sí/no para la fila de una lista, sin etiqueta a la vista (la fila ya
 * dice de qué es): activo o desactivado, con `role="switch"`. 52 × 32 a la
 * vista; el área táctil llega a 60 × 44. Para el sí/no con su etiqueta al
 * lado, `Interruptor`.
 */
export function InterruptorDeFila({ activo, etiqueta, alCambiar, disabled, className }: PropsDeInterruptorDeFila) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      aria-label={etiqueta}
      title={activo ? "Desactivar" : "Activar"}
      disabled={disabled}
      onClick={alCambiar}
      className={cn(
        "relative ml-1 inline-flex h-8 w-13 shrink-0 cursor-pointer items-center rounded-full p-1",
        "anillo-foco transition-colors duration-150 ease-suave after:absolute after:-inset-x-1 after:-inset-y-1.5 disabled:cursor-not-allowed disabled:opacity-50",
        activo ? "bg-navy" : "bg-texto-2",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-6 rounded-full bg-white shadow-sm transition-transform duration-300 ease-suave",
          activo && "translate-x-5"
        )}
      />
    </button>
  )
}
