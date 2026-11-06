import type { ReactNode } from "react"
import { CLASES_DE_TONO, type TonoDeLanding } from "@/components/landing/tonos-de-la-landing"
import { cn } from "@/lib/utils"

/*
 * Las piezas con que se arman las maquetas de la landing, en la paleta
 * Frutos rojos. Son pantallas del producto dibujadas con HTML, no capturas:
 * los datos son de ejemplo y cada maqueta se lee entera por su `etiqueta`.
 */

/** La tarjeta blanca de una maqueta: borde, radio de maqueta y la sombra honda. */
export const TARJETA_DE_MAQUETA =
  "rounded-maqueta border border-borde bg-tarjeta text-left text-navy shadow-maqueta squircle"

interface PropsDeMarcoDeMaqueta {
  /** Lo que el lector de pantalla dice en lugar del dibujo: qué muestra la maqueta. */
  etiqueta: string
  className?: string
  children: ReactNode
}

/** Una maqueta en su tarjeta blanca. Para el lector de pantalla es una imagen con su descripción. */
export function MarcoDeMaqueta({ etiqueta, className, children }: PropsDeMarcoDeMaqueta) {
  return (
    <div role="img" aria-label={etiqueta} className={cn(TARJETA_DE_MAQUETA, "p-5", className)}>
      <div aria-hidden="true">{children}</div>
    </div>
  )
}

const AVATAR_POR_TAMANO = {
  sm: "size-7 text-[11px]",
  md: "size-9 text-xs",
  lg: "size-[42px] text-sm",
  xl: "size-14 text-lg font-bold",
} as const

interface PropsDeAvatar {
  tono: TonoDeLanding
  /** 28, 36, 42 o 56 px. Por defecto, `md`. */
  tamano?: keyof typeof AVATAR_POR_TAMANO
  className?: string
  /** Las iniciales. */
  children: ReactNode
}

/** Las iniciales de alguien en un círculo de su tinte. */
export function Avatar({ tono, tamano = "md", className, children }: PropsDeAvatar) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold",
        CLASES_DE_TONO[tono].suave,
        CLASES_DE_TONO[tono].texto,
        AVATAR_POR_TAMANO[tamano],
        className
      )}
    >
      {children}
    </span>
  )
}

/** Además de los cuatro tintes: pistacho fuerte con navy (lo que está listo) y gris (lo que no). */
type TonoDeChip = TonoDeLanding | "listo" | "gris"

const CHIP: Record<TonoDeChip, string> = {
  ciruela: "bg-ciruela-suave text-ciruela",
  frambuesa: "bg-frambuesa-suave text-frambuesa-texto",
  pistacho: "bg-pistacho-suave text-pistacho-texto",
  anil: "bg-anil-suave text-anil",
  listo: "bg-pistacho text-navy",
  gris: "bg-superficie text-texto-2",
}

/** Una insignia chica de una maqueta: un estado, un origen, un permiso. */
export function Chip({ tono, className, children }: { tono: TonoDeChip; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-[11px] py-1 text-xs font-semibold",
        CHIP[tono],
        className
      )}
    >
      {children}
    </span>
  )
}

/** Un control segmentado dibujado, con una opción elegida. */
export function Segmentos({ opciones, elegida }: { opciones: readonly string[]; elegida: string }) {
  return (
    <span className="inline-flex gap-0.5 rounded-[12px] bg-superficie p-[3px]">
      {opciones.map((opcion) => (
        <span
          key={opcion}
          className={cn(
            "whitespace-nowrap rounded-[9px] px-2 py-[5px] text-xs min-[400px]:px-3",
            opcion === elegida ? "bg-tarjeta font-semibold shadow-sm" : "font-medium text-texto-2"
          )}
        >
          {opcion}
        </span>
      ))}
    </span>
  )
}

/** El cuadro de un ícono, en su tinte. El ícono llega ya con su tamaño. */
export function CuadroDeTono({
  tono,
  className,
  children,
}: {
  tono: TonoDeLanding
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-[10px]",
        CLASES_DE_TONO[tono].suave,
        CLASES_DE_TONO[tono].texto,
        className
      )}
    >
      {children}
    </span>
  )
}
