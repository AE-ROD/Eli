import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface PropsDeEstadoVacio {
  /** Arriba: el ícono en su cuadro. */
  icono?: ReactNode
  /** Una primera línea en negrita, para cuando el vacío es toda la sección ("Sin servicios aún"). */
  titulo?: ReactNode
  /** Qué falta, o qué hacer para que aparezca algo. */
  children: ReactNode
  className?: string
}

/**
 * El lugar de una lista que todavía no tiene nada: un recuadro de borde
 * punteado, para que se lea como un hueco y no como una tarjeta más.
 */
export function EstadoVacio({ icono, titulo, children, className }: PropsDeEstadoVacio) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 rounded-[20px] border-2 border-dashed border-borde px-4 py-5 text-center squircle lg:rounded-[24px] lg:py-6",
        className
      )}
    >
      {icono && <div className="mb-2">{icono}</div>}
      {titulo && <p className="text-[15px] font-medium text-navy lg:text-base">{titulo}</p>}
      <div className="max-w-sm text-sm text-pretty text-texto-2">{children}</div>
    </div>
  )
}
