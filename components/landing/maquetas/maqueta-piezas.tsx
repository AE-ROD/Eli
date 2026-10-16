"use client"

import { motion } from "framer-motion"
import type { ReactNode } from "react"
import { FONDO_FUERTE } from "@/components/comunes/colores-de-modulo"
import { CURVA } from "@/components/movimiento/tiempos"
import type { ColorDeModulo } from "@/lib/modulos"
import { cn } from "@/lib/utils"

/*
 * Las piezas con que se arman las maquetas de las secciones del medio de la
 * landing (un día, tablero, reportes, oficios y lo que trae Eli). Son pantallas
 * del producto dibujadas con HTML, no capturas: los datos son de ejemplo y
 * cada maqueta se lee entera por su `etiqueta`.
 *
 * Lo que se mueve entra al aparecer en pantalla, una vez; si la maqueta se
 * vuelve a montar (al pasar de un ítem a otro), entra de nuevo.
 */

interface PropsDeMarcoDeMaqueta {
  /** Lo que el lector de pantalla dice en lugar del dibujo: qué muestra la maqueta. */
  etiqueta: string
  className?: string
  children: ReactNode
}

/** La tarjeta blanca de una maqueta. Para el lector de pantalla es una imagen con su descripción. */
export function MarcoDeMaqueta({ etiqueta, className, children }: PropsDeMarcoDeMaqueta) {
  return (
    <div
      role="img"
      aria-label={etiqueta}
      className={cn(
        "w-full rounded-[24px] bg-tarjeta p-[18px] text-left text-[13px] leading-[1.35] text-navy shadow-md ring-1 ring-borde",
        className
      )}
    >
      <div aria-hidden="true">{children}</div>
    </div>
  )
}

interface PropsDeEntra {
  /** Segundos de espera, para que las filas entren de a una. */
  retraso?: number
  className?: string
  children: ReactNode
}

/** Una fila que sube y aparece, como algo que acaba de llegar. */
export function Entra({ retraso = 0, className, children }: PropsDeEntra) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, ease: CURVA.suave, delay: retraso }}
    >
      {children}
    </motion.div>
  )
}

interface PropsDeAvatar {
  color: ColorDeModulo
  /** 28, 32 o 44 px. Por defecto, `md`. */
  tamano?: "sm" | "md" | "lg"
  /** Las iniciales. */
  children: ReactNode
}

const AVATAR_POR_TAMANO = {
  sm: "size-7 text-[11px]",
  md: "size-8 text-xs",
  lg: "size-11 text-sm",
} as const

export function Avatar({ color, tamano = "md", children }: PropsDeAvatar) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold text-navy",
        AVATAR_POR_TAMANO[tamano],
        FONDO_FUERTE[color]
      )}
    >
      {children}
    </span>
  )
}

/** Una fila sobre gris claro: una reserva, una visita, un servicio. */
export function FilaDeMaqueta({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex items-center gap-2.5 rounded-[14px] bg-superficie px-3 py-2.5", className)}>{children}</div>
  )
}

/** Nombre arriba y detalle chico abajo, dentro de una fila. */
export function TextoDeFila({ titulo, detalle }: { titulo: ReactNode; detalle: ReactNode }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block font-medium">{titulo}</span>
      <span className="text-xs text-texto-2">{detalle}</span>
    </span>
  )
}

/** El título de la maqueta con algo a la derecha (una insignia, un monto). */
export function CabeceraDeMaqueta({ titulo, children }: { titulo: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2.5">
      <span className="text-sm font-semibold">{titulo}</span>
      {children}
    </div>
  )
}

export function Separador() {
  return <div className="my-3 h-px bg-borde" />
}

/** Un botón dibujado: dentro de la maqueta no se toca. */
export function BotonDeMaqueta({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "mt-3 flex h-9 items-center justify-center gap-2 rounded-[12px] bg-navy text-[13px] font-medium text-white [&_svg]:size-4",
        className
      )}
    >
      {children}
    </div>
  )
}

/** Una línea gris al pie de la maqueta, con su ícono. */
export function PieDeMaqueta({ icono, children }: { icono: ReactNode; children: ReactNode }) {
  return (
    <p className="mt-3 flex items-center gap-1.5 text-xs text-texto-2 [&_svg]:size-4 [&_svg]:shrink-0">
      {icono}
      {children}
    </p>
  )
}

interface PropsDeCirculo {
  /** `gris` para lo que no se puede (un candado). */
  tono: ColorDeModulo | "gris"
  className?: string
  /** El ícono: una marca o un candado. */
  children: ReactNode
}

/** Un círculo de 22px con un ícono que aparece de golpe, como algo que se confirma. */
export function Circulo({ tono, className, children }: PropsDeCirculo) {
  return (
    <motion.span
      className={cn(
        "grid size-[22px] shrink-0 place-items-center rounded-full text-navy [&_svg]:size-3.5 [&_svg]:stroke-[2.25]",
        tono === "gris" ? "bg-borde" : FONDO_FUERTE[tono],
        className
      )}
      initial={{ scale: 0 }}
      whileInView={{ scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, ease: CURVA.suave, delay: 0.3 }}
    >
      {children}
    </motion.span>
  )
}

interface PropsDeBarra {
  /** De 0 a 1: cuánto de la barra se llena. */
  fraccion: number
  color?: ColorDeModulo
  retraso?: number
  className?: string
}

/** Una barra horizontal que se llena al aparecer. Crece con `scaleX`, no con el ancho. */
export function Barra({ fraccion, color = "lima", retraso = 0.3, className }: PropsDeBarra) {
  return (
    <span className={cn("block h-2 overflow-hidden rounded-[4px] bg-superficie", className)}>
      <motion.span
        className={cn("block h-full w-full origin-left rounded-[4px]", FONDO_FUERTE[color])}
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: fraccion }}
        viewport={{ once: true }}
        transition={{ duration: 0.7, ease: CURVA.suave, delay: retraso }}
      />
    </span>
  )
}

interface PropsDeColumna {
  /** De 0 a 1: la altura de la columna contra la más alta. */
  fraccion: number
  color?: ColorDeModulo
  retraso?: number
}

/** Una columna de un gráfico de barras que crece desde abajo con `scaleY`. Ocupa el alto que le deja su contenedor. */
export function Columna({ fraccion, color = "lima", retraso = 0.2 }: PropsDeColumna) {
  return (
    <span className="relative block w-full flex-1">
      <motion.span
        className={cn("absolute inset-x-0 bottom-0 h-full origin-bottom rounded-t-[4px]", FONDO_FUERTE[color])}
        initial={{ scaleY: 0 }}
        whileInView={{ scaleY: fraccion }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: CURVA.suave, delay: retraso }}
      />
    </span>
  )
}

/** Un control segmentado dibujado, con una opción elegida. */
export function Segmentos({ opciones, elegida }: { opciones: readonly string[]; elegida: string }) {
  return (
    <div className="flex gap-0.5 rounded-[12px] bg-superficie p-[3px]">
      {opciones.map((opcion) => (
        <span
          key={opcion}
          className={cn(
            "flex-1 rounded-[9px] px-1 py-1.5 text-center text-xs font-medium",
            opcion === elegida ? "bg-tarjeta text-navy shadow-sm" : "text-texto-2"
          )}
        >
          {opcion}
        </span>
      ))}
    </div>
  )
}

/** Los pasos de la página de reservas: servicio, día y hora, datos. */
export function PasosDeReserva({ hechos, total = 3 }: { hechos: number; total?: number }) {
  return (
    <div className="mt-2.5 mb-0.5 flex gap-1.5">
      {Array.from({ length: total }, (_, paso) => (
        <span key={paso} className={cn("h-1 flex-1 rounded-full", paso < hechos ? "bg-navy" : "bg-borde")} />
      ))}
    </div>
  )
}
