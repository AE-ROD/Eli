"use client"

import { useId, type DragEvent } from "react"
import { Boton } from "@/components/comunes/boton"
import { Insignia } from "@/components/comunes/insignia"
import { formatearHora } from "@/lib/fechas"
import { cn } from "@/lib/utils"
import type { Reserva } from "../_datos"
import { CLASES_DE_TARJETA, MomentoDeTarjeta, NombreDeTarjeta } from "./partes-de-tarjeta"

/** Lo que el tablero le pasa a una tarjeta para que se pueda arrastrar (sólo en escritorio). */
export interface PropsDeArrastre {
  draggable: boolean
  onDragStart: (evento: DragEvent<HTMLElement>) => void
  onDragEnd: () => void
}

interface PropsDeTarjetaDeReserva {
  reserva: Reserva
  /**
   * Cómo se nombra la reserva en su botón, para el lector de pantalla: el
   * cliente y la hora y, si otra reserva del tablero se llama igual (la misma
   * clienta, a la misma hora), un ordinal. Lo calcula el tablero, que las ve
   * todas.
   */
  quien: string
  /** La hora ya pasó y todavía no llegó. */
  atrasada: boolean
  /** Hay un pedido en curso para esta reserva: el botón espera. */
  enCurso: boolean
  arrastre: PropsDeArrastre
  onLlego: () => void
}

/**
 * Una cita de hoy que todavía no llegó: hora, cliente, servicio y profesional,
 * y el botón "Llegó".
 *
 * La tarjeta se puede enfocar desde el código (`data-reserva`): si "Llegó"
 * falla porque el tablero quedó viejo y la reserva sigue ahí, el foco vuelve a
 * ella después de recargar.
 */
export function TarjetaDeReserva({ reserva, quien, atrasada, enCurso, arrastre, onLlego }: PropsDeTarjetaDeReserva) {
  const idDelNombre = useId()

  return (
    <article
      aria-labelledby={idDelNombre}
      data-reserva={reserva.id}
      tabIndex={-1}
      {...arrastre}
      className={cn(CLASES_DE_TARJETA, arrastre.draggable && "cursor-grab active:cursor-grabbing")}
    >
      <div className="flex min-h-[22px] flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <MomentoDeTarjeta iso={reserva.inicio}>{formatearHora(reserva.inicio)}</MomentoDeTarjeta>
        {atrasada && <Insignia tono="naranja">Atrasada</Insignia>}
      </div>

      <NombreDeTarjeta id={idDelNombre} apagado={!reserva.cliente}>
        {reserva.cliente?.nombre ?? "Sin cliente"}
      </NombreDeTarjeta>

      <p className="text-[13px] leading-snug break-words">
        {reserva.titulo} <span className="text-texto-2">· {reserva.profesional?.nombre ?? "Sin profesional asignado"}</span>
      </p>

      <Boton
        variante="secundario"
        tamano="sm"
        onClick={onLlego}
        cargando={enCurso}
        aria-label={enCurso ? `Marcando la llegada: ${quien}` : `Llegó: ${quien}`}
        className="w-full"
      >
        Llegó
      </Boton>
    </article>
  )
}
