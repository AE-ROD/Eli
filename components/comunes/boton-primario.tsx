"use client"

import type { ButtonHTMLAttributes, ReactNode } from "react"
import { Boton } from "@/components/comunes/boton"
import { cn } from "@/lib/utils"

interface BotonPrimarioProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variante?: "primario" | "secundario" | "fantasma" | "peligro"
  tamaño?: "sm" | "md" | "lg"
  /** Muestra un indicador y no responde, sin perder el foco (ver `Boton`). */
  cargando?: boolean
  /** Va junto al texto, sin el cuadro blanco de `Boton`. */
  icono?: ReactNode
  iconoDerecha?: boolean
  anchoCompleto?: boolean
}

/**
 * El botón de los formularios y del panel, con la API de siempre. Por dentro
 * es un `Boton`: mismo aspecto, mismo foco y la misma forma de cargar con
 * `aria-disabled`. Para código nuevo, `Boton` directamente.
 *
 * `peligro` no existe en `Boton`: es el primario en el rojo de error, para
 * las acciones que no se deshacen (anular un cobro, cancelar una cita).
 */
export function BotonPrimario({
  children,
  variante = "primario",
  tamaño = "md",
  cargando = false,
  icono,
  iconoDerecha = false,
  anchoCompleto = false,
  className,
  ...props
}: BotonPrimarioProps) {
  return (
    <Boton
      {...props}
      variante={variante === "peligro" ? "primario" : variante}
      tamano={tamaño}
      cargando={cargando}
      // Con `cn` lo que llega en `className` le gana a lo de acá cuando chocan:
      // `hidden` saca al `inline-flex` en vez de competir con él en el CSS.
      className={cn(
        variante === "peligro" && "bg-error text-white hover:bg-error/90",
        // Con `w-full`, `Boton` se deja achicar: dos de ancho completo comparten la fila.
        anchoCompleto && "w-full",
        className
      )}
    >
      {icono && !iconoDerecha && icono}
      {children}
      {icono && iconoDerecha && icono}
    </Boton>
  )
}
