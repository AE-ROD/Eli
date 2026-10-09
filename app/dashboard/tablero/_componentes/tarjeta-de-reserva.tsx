"use client"

import { useId, type DragEvent } from "react"
import { Clock } from "lucide-react"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { ANILLO_DE_FOCO } from "@/components/panel/estilos"
import { formatearHora, horaConArticulo } from "@/lib/fechas"
import { cn } from "@/lib/utils"
import type { Reserva } from "../_datos"

/** Lo que el tablero le pasa a una tarjeta para que se pueda arrastrar (sólo en escritorio). */
export interface PropsDeArrastre {
  draggable: boolean
  onDragStart: (evento: DragEvent<HTMLElement>) => void
  onDragEnd: () => void
}

interface TarjetaDeReservaProps {
  reserva: Reserva
  /** La hora ya pasó y todavía no llegó. */
  atrasada: boolean
  /** Hay un pedido en curso para esta reserva: el botón espera. */
  enCurso: boolean
  arrastre: PropsDeArrastre
  onLlego: () => void
}

/** Una cita de hoy que todavía no llegó: hora, cliente, servicio y profesional, y el botón "Llegó". */
export function TarjetaDeReserva({ reserva, atrasada, enCurso, arrastre, onLlego }: TarjetaDeReservaProps) {
  const idDelNombre = useId()
  const nombre = reserva.cliente?.nombre ?? "Sin cliente"
  // Con la hora: dos reservas de la misma clienta no se llaman igual para el lector de pantalla.
  const quien = `${nombre}, reserva de ${horaConArticulo(reserva.inicio)}`

  return (
    <article
      aria-labelledby={idDelNombre}
      {...arrastre}
      className={cn(
        "rounded-lg border border-border/70 bg-card p-3 shadow-sm space-y-2",
        atrasada && "border-l-4 border-l-amber-500",
        arrastre.draggable && "cursor-grab active:cursor-grabbing"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground tabular-nums">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <time dateTime={reserva.inicio}>{formatearHora(reserva.inicio)}</time>
        </p>
        {atrasada && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
            Atrasada
          </span>
        )}
      </div>

      <div className="min-w-0">
        <h3 id={idDelNombre} className={cn("text-sm font-medium truncate", reserva.cliente ? "text-foreground" : "text-muted-foreground")}>
          {nombre}
        </h3>
        <p className="text-xs text-muted-foreground truncate">
          {reserva.titulo} · {reserva.profesional?.nombre ?? "Sin profesional asignado"}
        </p>
      </div>

      <BotonPrimario
        tamaño="sm"
        anchoCompleto
        onClick={onLlego}
        cargando={enCurso}
        aria-label={enCurso ? `Marcando la llegada: ${quien}` : `Llegó: ${quien}`}
        className={ANILLO_DE_FOCO}
      >
        Llegó
      </BotonPrimario>
    </article>
  )
}
