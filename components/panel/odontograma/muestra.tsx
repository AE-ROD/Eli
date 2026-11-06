import type { CSSProperties } from "react"
import { cn } from "@/lib/utils"
import {
  COLOR_DE_AUSENTE,
  COLOR_DE_CARA,
  COLOR_DE_CORONA,
  COLOR_DE_ENDODONCIA,
  COLOR_DE_EXTRACCION,
  COLOR_DEL_CONTORNO,
  RAYAS_DE_SELLANTE,
} from "./colores"
import type { Herramienta } from "./marcas"

/** Una X de dos barras en diagonal, del color pedido. */
const equis = (color: string) =>
  `linear-gradient(45deg, transparent 38%, ${color} 38% 62%, transparent 62%), linear-gradient(-45deg, transparent 38%, ${color} 38% 62%, transparent 62%)`

/** Cómo se ve cada marca en chico, igual que en el dibujo de la pieza. */
const ESTILOS: Record<Herramienta, CSSProperties> = {
  caries: { background: COLOR_DE_CARA.caries, borderRadius: 3 },
  obturacion: { background: COLOR_DE_CARA.obturacion, borderRadius: 3 },
  sellante: { background: RAYAS_DE_SELLANTE, borderRadius: 3 },
  corona: { border: `2px solid ${COLOR_DE_CORONA}`, borderRadius: 4 },
  endodoncia: { background: COLOR_DE_ENDODONCIA, clipPath: "polygon(50% 0, 100% 100%, 0 100%)" },
  ausente: { background: equis(COLOR_DE_AUSENTE) },
  extraccion: { background: equis(COLOR_DE_EXTRACCION) },
  borrar: { background: "#ffffff", border: `1.5px solid ${COLOR_DEL_CONTORNO}`, borderRadius: 3 },
}

/**
 * La muestra de una marca (o de "Borrar") en un cuadrito, para la barra de
 * herramientas, la leyenda y los botones de cara. Es decorativa: siempre va
 * junto al nombre de la marca.
 */
export function MuestraDeMarca({ herramienta, className }: { herramienta: Herramienta; className?: string }) {
  return <span aria-hidden="true" className={cn("block size-3 shrink-0", className)} style={ESTILOS[herramienta]} />
}
