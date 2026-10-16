import type { LucideIcon } from "lucide-react"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import type { ColorDeModulo } from "@/lib/modulos"
import { cn } from "@/lib/utils"

interface TarjetaEstadisticaProps {
  titulo: string
  valor: string | number
  icono: LucideIcon
  /** El pastel del módulo del que sale la cifra: las citas de la agenda, los clientes, lo cobrado. */
  color: ColorDeModulo
  /**
   * De qué está hecha la cifra: la línea que la explica. Se omite cuando no hay
   * nada verdadero que decir: nunca se rellena con una frase vaga, que es la
   * misma mentira que un `+0%` con más palabras.
   */
  procedencia?: string
}

/** Una cifra del inicio, en grande, con lo que mide arriba y de qué está hecha abajo. No es un enlace: no se eleva. */
export function TarjetaEstadistica({ titulo, valor, icono, color, procedencia }: TarjetaEstadisticaProps) {
  return (
    <div className={cn(TARJETA_DEL_PANEL, "flex h-full flex-col p-5 sm:p-6")}>
      <div className="flex items-start justify-between gap-3">
        <p className="pt-1.5 text-sm font-medium text-texto-2">{titulo}</p>
        <CuadroDeIcono icono={icono} color={color} tamano="sm" />
      </div>
      {/* Un monto muy largo baja de renglón antes que salirse de la tarjeta. */}
      <p className="mt-2 text-[2rem] leading-[1.1] font-medium tracking-[-1px] break-words tabular-nums">{valor}</p>
      {procedencia && <p className="mt-2 text-sm leading-snug text-pretty text-texto-2">{procedencia}</p>}
    </div>
  )
}
