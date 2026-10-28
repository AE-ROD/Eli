import type { ReactNode } from "react"
import { formatearMonto } from "@/lib/dinero"
import { deTexto, formatearDuracionDeServicio } from "@/lib/fechas"
import { cn } from "@/lib/utils"
import { fechaParaLeer } from "./selector-fecha-hora"
import type { ServicioPublico } from "./selector-servicio"

interface PropsDeResumenDeReserva {
  servicio: ServicioPublico | null
  /** `AAAA-MM-DD`, como lo guarda el formulario. */
  fecha: string
  /** `HH:MM`. */
  hora: string
  /** Con quién; `null` o sin dar, no se muestra la fila. */
  profesional?: string | null
  /** Sin la fila del servicio, cuando ya está escrito arriba (la reserva confirmada). */
  sinServicio?: boolean
  className?: string
}

/**
 * Lo que se va a reservar, en filas: servicio, duración, día, hora y precio.
 * La fecha se escribe con palabras ("jueves 15 de octubre") en vez de
 * `2026-10-15`; si no se pudiera leer, queda como llegó.
 */
export function ResumenDeReserva({ servicio, fecha, hora, profesional, sinServicio = false, className }: PropsDeResumenDeReserva) {
  const dia = deTexto(fecha)
  return (
    <dl className={cn("divide-y divide-borde text-sm", className)}>
      {servicio && !sinServicio && <Fila termino="Servicio">{servicio.name}</Fila>}
      {servicio && <Fila termino="Duración">{formatearDuracionDeServicio(servicio.duration)}</Fila>}
      {profesional && <Fila termino="Con">{profesional}</Fila>}
      <Fila termino="Día">{dia ? fechaParaLeer(dia) : fecha}</Fila>
      <Fila termino="Hora">{hora}</Fila>
      {servicio?.price != null && <Fila termino="Precio">{formatearMonto(servicio.price)}</Fila>}
    </dl>
  )
}

function Fila({ termino, children }: { termino: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <dt className="shrink-0 text-texto-2">{termino}</dt>
      <dd className="min-w-0 text-right font-medium break-words text-navy tabular-nums">{children}</dd>
    </div>
  )
}
