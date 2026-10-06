"use client"

import { useId, useRef } from "react"
import { ChevronLeft, ChevronRight, Receipt } from "lucide-react"
import { ANILLO_DE_FOCO } from "@/components/panel/estilos"
import { formatearMonto } from "@/lib/dinero"
import { formatearHora } from "@/lib/fechas"
import { TURNOS } from "@/lib/reportes"
import { cn } from "@/lib/utils"
import type { FilaDeReporte, Reporte } from "../_datos"

/** `mar, 6 oct`: el día del cobro, corto, en la hora de quien mira. */
function diaCorto(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })
}

const nombreDeTurno = (id: string) => TURNOS.find((turno) => turno.id === id)?.nombre ?? id

function Servicios({ fila }: { fila: FilaDeReporte }) {
  return (
    <ul className="space-y-0.5">
      {fila.lineas.map((linea) => (
        <li key={linea.id}>
          {linea.servicio}{" "}
          <span className="text-muted-foreground">
            · {linea.profesional.nombre}
            {linea.profesional.id === null && " (ya no está en el equipo)"} · {formatearMonto(linea.precio)}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Medios({ fila }: { fila: FilaDeReporte }) {
  if (!fila.pagos || fila.pagos.length === 0) return <span className="text-muted-foreground">Sin pago (cortesía)</span>
  const dividido = fila.pagos.length > 1
  return (
    <ul className="space-y-0.5">
      {fila.pagos.map((pago) => (
        <li key={pago.id}>
          {pago.nombreMedio}
          {dividido && <span className="text-muted-foreground tabular-nums"> {formatearMonto(pago.monto)}</span>}
        </li>
      ))}
    </ul>
  )
}

const BOTON_DE_PAGINA =
  "inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"

interface HistorialDeCobrosProps {
  reporte: Reporte
  /** Mientras llega otra página o el resultado de otros filtros. */
  actualizando: boolean
  onPagina: (pagina: number) => void
}

/**
 * Cada atención cobrada del período: cuándo, en qué turno, a quién, qué se
 * hizo y quién lo hizo y, para dueño y encargado, el total y cómo se pagó.
 */
export function HistorialDeCobros({ reporte, actualizando, onPagina }: HistorialDeCobrosProps) {
  const idDelTitulo = useId()
  const seccion = useRef<HTMLElement>(null)
  const delNegocio = reporte.alcance === "negocio"
  const cantidad = reporte.total ?? reporte.resumen.cantidad
  const { pagina, paginas } = reporte

  // Al cambiar de página se vuelve al principio de la tabla: los botones
  // están abajo y la página nueva empieza arriba.
  const irA = (otra: number) => {
    onPagina(otra)
    seccion.current?.scrollIntoView({ block: "start", behavior: "smooth" })
  }

  return (
    <section ref={seccion} aria-labelledby={idDelTitulo} className="bg-card border border-border/50 rounded-xl scroll-mt-24">
      <div className="flex flex-wrap items-baseline justify-between gap-2 p-5 border-b border-border/50">
        <h2 id={idDelTitulo} className="font-semibold text-foreground">
          Historial de cobros
        </h2>
        <p className="text-sm text-muted-foreground">
          {cantidad === 1 ? "1 atención" : `${cantidad} atenciones`}
        </p>
      </div>

      {reporte.filas.length === 0 ? (
        <div className="text-center py-12 px-5">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
            <Receipt className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
          </div>
          <p className="font-medium text-foreground">No hay atenciones cobradas</p>
          <p className="text-sm text-muted-foreground mt-1">Prueba con otro período o con otros filtros.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className={cn("w-full text-sm", delNegocio ? "min-w-[760px]" : "min-w-[560px]")}>
            <caption className="sr-only">
              Atenciones cobradas, página {pagina} de {paginas}
            </caption>
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border/50">
                <th scope="col" className="px-5 py-2.5 font-medium">Cobrada</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Turno</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Cliente</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Servicios</th>
                {delNegocio && (
                  <>
                    <th scope="col" className="px-3 py-2.5 font-medium text-right">Total</th>
                    <th scope="col" className="px-5 py-2.5 font-medium">Medios</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className={cn("divide-y divide-border/50", actualizando && "opacity-60")}>
              {reporte.filas.map((fila) => (
                <tr key={fila.id} className="align-top">
                  <td className="px-5 py-3 whitespace-nowrap">
                    <time dateTime={fila.cobradaEn}>
                      <span className="block text-foreground">{diaCorto(fila.cobradaEn)}</span>
                      <span className="block text-muted-foreground tabular-nums">{formatearHora(fila.cobradaEn)}</span>
                    </time>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">{nombreDeTurno(fila.turno)}</td>
                  <td className="px-3 py-3 text-foreground">{fila.cliente.nombre}</td>
                  <td className="px-3 py-3 text-foreground">
                    <Servicios fila={fila} />
                  </td>
                  {delNegocio && (
                    <>
                      <td className="px-3 py-3 text-right font-semibold text-foreground tabular-nums whitespace-nowrap">
                        {fila.total !== undefined ? formatearMonto(fila.total) : "—"}
                      </td>
                      <td className="px-5 py-3 text-foreground">
                        <Medios fila={fila} />
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paginas > 1 && (
        <nav aria-label="Páginas del historial" className="flex items-center justify-between gap-3 p-4 border-t border-border/50">
          <button
            type="button"
            onClick={() => irA(pagina - 1)}
            disabled={pagina <= 1 || actualizando}
            className={cn(BOTON_DE_PAGINA, ANILLO_DE_FOCO)}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Anterior
          </button>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Página {pagina} de {paginas}
          </p>
          <button
            type="button"
            onClick={() => irA(pagina + 1)}
            disabled={pagina >= paginas || actualizando}
            className={cn(BOTON_DE_PAGINA, ANILLO_DE_FOCO)}
          >
            Siguiente
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </nav>
      )}
    </section>
  )
}
