import type { ReactNode } from "react"
import { cva } from "class-variance-authority"
import type { ColorDeModulo } from "@/lib/modulos"
import { FONDO_SUAVE } from "@/components/comunes/colores-de-modulo"
import { cn } from "@/lib/utils"

/**
 * El gris es sólido, no transparente, para que se vea igual sobre crema,
 * sobre blanco y sobre navy. El texto es siempre navy: sobre cualquiera de
 * los pasteles pasa de sobra el contraste.
 */
const variantesDeInsignia = cva(
  "inline-flex h-6 shrink-0 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-medium tracking-[0.02em] text-navy",
  {
    variants: {
      tono: { gris: "bg-borde", ...FONDO_SUAVE },
    },
    defaultVariants: { tono: "gris" },
  }
)

interface PropsDeInsignia {
  children: ReactNode
  /** Por defecto, `gris`: "Beta", "Nuevo". Con un color de módulo, su pastel suave. */
  tono?: "gris" | ColorDeModulo
  className?: string
}

/** Una etiqueta chica en forma de píldora. */
export function Insignia({ children, tono = "gris", className }: PropsDeInsignia) {
  return <span className={cn(variantesDeInsignia({ tono }), className)}>{children}</span>
}
