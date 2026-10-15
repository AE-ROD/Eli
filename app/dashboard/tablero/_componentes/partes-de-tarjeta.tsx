"use client"

import type { ReactNode } from "react"
import { Clock, type LucideIcon } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { cn } from "@/lib/utils"

/**
 * Lo que comparten las tarjetas del tablero (la de una reserva y la de una
 * atención), para que se vean iguales: el marco, la línea de la hora, el
 * nombre del cliente y los botones de ícono.
 */

/**
 * Blanca, de radio 24 (dentro de una columna una tarjeta de 48 se vería
 * hinchada), con sombra sm que pasa a md con el cursor encima. Se puede
 * enfocar desde el código: después de moverla, el foco la sigue a su columna
 * nueva, así que lleva el anillo.
 *
 * Al aparecer (en su columna nueva, o la primera vez que se pinta el tablero)
 * entra con un fundido corto. Las que no se movieron no se vuelven a montar en
 * cada recarga, así que no parpadean. Con movimiento reducido no hay fundido.
 */
export const CLASES_DE_TARJETA = cn(
  "flex min-w-0 flex-col gap-2.5 rounded-[24px] bg-tarjeta p-3.5 text-navy shadow-sm squircle anillo-foco",
  "transition-shadow duration-200 ease-suave hover:shadow-md",
  "motion-safe:animate-in motion-safe:fade-in motion-safe:animation-duration-300"
)

/** El nombre del cliente, el título de la tarjeta. Un nombre largo baja de renglón en vez de cortarse. */
export function NombreDeTarjeta({ id, apagado = false, children }: { id: string; apagado?: boolean; children: ReactNode }) {
  return (
    <h3
      id={id}
      className={cn("text-[15px] font-semibold leading-[1.3] tracking-[-0.2px] break-words", apagado && "text-texto-2")}
    >
      {children}
    </h3>
  )
}

/** La hora de la reserva, o desde cuándo está la atención en su columna. */
export function MomentoDeTarjeta({ iso, children }: { iso: string; children: ReactNode }) {
  return (
    <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium leading-snug text-texto-2 tabular-nums">
      <Clock aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={1.75} />
      <time dateTime={iso}>{children}</time>
    </p>
  )
}

/** Un servicio de la tarjeta: qué y, en gris, quién. */
export function LineaDeServicio({ servicio, profesional, children }: { servicio: string; profesional: string; children?: ReactNode }) {
  return (
    <li className="text-[13px] leading-snug break-words">
      {servicio} <span className="text-texto-2">· {profesional}</span>
      {children}
    </li>
  )
}

interface PropsDeHerramienta {
  /** El nombre completo, con el cliente y la hora: dos visitas de la misma clienta no se confunden. */
  etiqueta: string
  /** Lo que dice el globo al pasar el cursor: la acción, corta. */
  globo: string
  icono: LucideIcon
  /** Anular: en el rojo de error. */
  peligro?: boolean
  /**
   * Hay un pedido en curso para la tarjeta. El botón no se deshabilita: un
   * botón deshabilitado pierde el foco, que caía al `<body>`. Queda marcado
   * con `aria-disabled` y el clic no hace nada.
   */
  ocupado: boolean
  onClick: () => void
}

/**
 * Las acciones de cada día son el botón grande de la tarjeta. Las otras
 * (editar los servicios, volver un paso, deshacer la llegada, anular) son
 * botones de ícono en una fila debajo: con texto no entraban en una columna
 * de 196 px y la tarjeta crecía dos o tres renglones. Cada uno tiene su nombre
 * completo para el lector de pantalla y un globo con la acción.
 *
 * Miden 36 px a la vista y 44 × 44 para el dedo.
 */
export function Herramienta({ etiqueta, globo, icono: Icono, peligro = false, ocupado, onClick }: PropsDeHerramienta) {
  return (
    <Boton
      variante="fantasma"
      tamano="sm"
      aria-label={etiqueta}
      title={globo}
      aria-disabled={ocupado || undefined}
      onClick={ocupado ? undefined : onClick}
      className={cn("w-9 px-0 after:-inset-x-1", peligro && "text-error hover:bg-error/8")}
    >
      <Icono aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
    </Boton>
  )
}
