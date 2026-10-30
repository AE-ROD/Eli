import type { ReactNode } from "react"
import { formatearMonto } from "@/lib/dinero"
import { deTexto, formatearDuracionDeServicio } from "@/lib/fechas"
import type { PrecioDeLaHora } from "@/lib/hora-valle"
import { cn } from "@/lib/utils"
import { fechaParaLeer } from "./selector-fecha-hora"
import type { ServicioPublico } from "./selector-servicio"

interface PropsDeResumenDeReserva {
  /**
   * Con varios servicios (#89a), ya combinados: nombres unidos, duración y
   * precio sumados. `precioIncompleto`: alguno no tiene precio publicado.
   */
  servicio: (ServicioPublico & { precioIncompleto?: boolean }) | null
  /** `AAAA-MM-DD`, como lo guarda el formulario. */
  fecha: string
  /** `HH:MM`. */
  hora: string
  /** Con quién; `null` o sin dar, no se muestra la fila. */
  profesional?: string | null
  /**
   * El precio de la hora elegida, si es de hora valle (#89c): se muestra el
   * normal tachado y el rebajado. El que vale lo calcula el servidor.
   */
  precioDeLaHora?: PrecioDeLaHora | null
  /** Sin la fila del servicio, cuando ya está escrito arriba (la reserva confirmada). */
  sinServicio?: boolean
  className?: string
}

/**
 * Lo que se va a reservar, en filas: servicio, duración, día, hora y precio.
 * La fecha se escribe con palabras ("jueves 15 de octubre") en vez de
 * `2026-10-15`; si no se pudiera leer, queda como llegó.
 */
export function ResumenDeReserva({
  servicio,
  fecha,
  hora,
  profesional,
  precioDeLaHora,
  sinServicio = false,
  className,
}: PropsDeResumenDeReserva) {
  const dia = deTexto(fecha)
  const rebajado =
    precioDeLaHora && precioDeLaHora.precio !== null && precioDeLaHora.precioNormal !== null &&
    precioDeLaHora.precio < precioDeLaHora.precioNormal
      ? { precio: precioDeLaHora.precio, normal: precioDeLaHora.precioNormal, porcentaje: precioDeLaHora.porcentaje }
      : null
  return (
    <dl className={cn("divide-y divide-borde text-sm", className)}>
      {servicio && !sinServicio && <Fila termino="Servicio">{servicio.name}</Fila>}
      {servicio && <Fila termino="Duración">{formatearDuracionDeServicio(servicio.duration)}</Fila>}
      {profesional && <Fila termino="Con">{profesional}</Fila>}
      <Fila termino="Día">{dia ? fechaParaLeer(dia) : fecha}</Fila>
      <Fila termino="Hora">{hora}</Fila>
      {servicio?.price != null && (
        <Fila termino="Precio">
          {rebajado ? (
            <>
              <s className="mr-2 font-normal text-texto-2">
                <span className="sr-only">Precio normal: </span>
                {formatearMonto(rebajado.normal)}
              </s>
              {formatearMonto(rebajado.precio)}
              <span className="mt-0.5 block text-xs font-normal text-texto-2">
                Hora valle: {rebajado.porcentaje}% menos
              </span>
            </>
          ) : (
            formatearMonto(servicio.price)
          )}
          {servicio.precioIncompleto ? " + a consultar" : ""}
        </Fila>
      )}
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
