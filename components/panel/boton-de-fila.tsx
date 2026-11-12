"use client"

import type { ButtonHTMLAttributes, ReactNode } from "react"
import { cn } from "@/lib/utils"

interface PropsDeBotonDeFila extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "title" | "children"> {
  /** Su único nombre: el ícono no se lee. También es el `title` (lo que sale al pasar el cursor). */
  etiqueta: string
  /** El texto corto del `title`, si el nombre accesible es más largo ("Subir" frente a "Subir Providencia"). */
  titulo?: string
  icono: ReactNode
}

/**
 * El botón de sólo ícono de la fila de una lista (subir, bajar, editar,
 * borrar): 44 × 44 px, lo mínimo para un dedo, con el foco del sistema. Sin
 * relleno: se oscurece al pasar el cursor. Apagado (`disabled`) se ve más
 * pálido y no responde.
 */
export function BotonDeFila({ etiqueta, titulo, icono, className, type = "button", ...props }: PropsDeBotonDeFila) {
  return (
    <button
      {...props}
      type={type}
      aria-label={etiqueta}
      title={titulo ?? etiqueta}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-[14px] text-navy squircle anillo-foco transition-colors duration-150 ease-suave hover:bg-superficie disabled:cursor-not-allowed disabled:text-texto-2/50 disabled:hover:bg-transparent",
        className
      )}
    >
      {icono}
    </button>
  )
}
