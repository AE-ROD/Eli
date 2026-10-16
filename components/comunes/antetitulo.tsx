import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface PropsDeAntetitulo {
  children: ReactNode
  className?: string
  /** Por defecto, `p`. `span` para ponerlo dentro de un enlace o un botón. */
  como?: "p" | "span"
}

/**
 * La línea chica en mayúsculas que va arriba de un titular y dice de qué se
 * trata. Sobre navy, pásale `text-white/70`: el gris de texto secundario no
 * llega al contraste mínimo sobre ese fondo.
 */
export function Antetitulo({ children, className, como: Etiqueta = "p" }: PropsDeAntetitulo) {
  return <Etiqueta className={cn("antetitulo", className)}>{children}</Etiqueta>
}
