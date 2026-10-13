import type { ReactNode } from "react"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

// Es blanca aunque esté sobre navy: adentro, el contorno del foco vuelve a navy.
const variantesDeTarjeta = cva("rounded-tarjeta bg-tarjeta text-navy shadow-sm squircle anillo-foco-oscuro", {
  variants: {
    interactiva: {
      true: "transition-[box-shadow,translate] duration-200 ease-suave hover:-translate-y-0.5 hover:shadow-md has-focus-visible:-translate-y-0.5 has-focus-visible:shadow-md",
      false: "",
    },
  },
  defaultVariants: { interactiva: false },
})

interface PropsDeTarjeta {
  /**
   * Se eleva al pasar el cursor: sombra md y 2px hacia arriba. También cuando
   * algo de adentro tiene el foco del teclado, así quien navega con Tab ve lo
   * mismo que quien usa el mouse. La tarjeta no es enfocable: el enlace o el
   * botón va adentro.
   */
  interactiva?: boolean
  /** La etiqueta que la envuelve. Por defecto, `div`. */
  como?: "div" | "article" | "li" | "section"
  className?: string
  children: ReactNode
}

/** Blanca, con radio de tarjeta y sombra suave. El relleno lo pone quien la usa. */
export function Tarjeta({ interactiva = false, como: Etiqueta = "div", className, children }: PropsDeTarjeta) {
  return <Etiqueta className={cn(variantesDeTarjeta({ interactiva }), className)}>{children}</Etiqueta>
}
