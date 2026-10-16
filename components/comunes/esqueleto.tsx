import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

const variantesDeEsqueleto = cva(
  [
    "relative block shrink-0 overflow-hidden rounded-full bg-borde",
    "after:absolute after:inset-0 after:animate-brillo after:bg-linear-to-r after:from-white/0 after:via-white/75 after:to-white/0 motion-reduce:after:hidden",
  ],
  {
    variants: {
      forma: { barra: "h-3 w-full", circulo: "size-12" },
    },
    defaultVariants: { forma: "barra" },
  }
)

interface PropsDeEsqueleto {
  /** Por defecto, `barra`: una línea de texto que todavía no llegó. */
  forma?: "barra" | "circulo"
  /** El tamaño: `w-2/3`, `h-4`, `size-14`… */
  className?: string
}

/**
 * El lugar de algo que está cargando, con el mismo tamaño que va a tener para
 * que nada salte cuando llegue. Un brillo lo cruza cada 2,4 s; con "reducir
 * movimiento" queda quieto. Es invisible para el lector de pantalla: avisar
 * que algo carga (`aria-busy`) le toca al contenedor.
 */
export function Esqueleto({ forma = "barra", className }: PropsDeEsqueleto) {
  return <span aria-hidden="true" className={cn(variantesDeEsqueleto({ forma }), className)} />
}
