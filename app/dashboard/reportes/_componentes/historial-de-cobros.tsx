"use client"

import { useEffect, useId, useRef } from "react"
import { Ban, Receipt } from "lucide-react"
import { ANILLO_DE_FOCO } from "@/components/panel/estilos"
import { formatearMonto } from "@/lib/dinero"
import { formatearHora, horaConArticulo } from "@/lib/fechas"
import { TURNOS } from "@/lib/reportes"
import { cn } from "@/lib/utils"
import type { FilaDeReporte, Reporte } from "../_datos"
import { Paginador } from "./paginador"

/** `mar, 6 oct`: el día del cobro, corto, en la hora de quien mira. */
export function diaCorto(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })
}

const nombreDeTurno = (id: string) => TURNOS.find((turno) => turno.id === id)?.nombre ?? id

/**
 * Los servicios de la atención. Con filtro de profesional o de servicio
 * (`resaltar`), las líneas que lo cumplen (`coincide`) son las que suman en el
 * resumen: van resaltadas, y las demás atenuadas, con un aviso para el lector
 * de pantalla. Sin esos filtros se ven todas iguales.
 */
function Servicios({ fila, resaltar }: { fila: FilaDeReporte; resaltar: boolean }) {
  return (
    <ul className="space-y-0.5">
      {fila.lineas.map((linea) => {
        const destacada = resaltar && linea.coincide
        const atenuada = resaltar && !linea.coincide
        return (
          <li key={linea.id} className={cn(destacada && "font-medium", atenuada && "text-muted-foreground opacity-70")}>
            {linea.servicio}{" "}
            <span className={cn(!destacada && "text-muted-foreground")}>
              · {linea.profesional.nombre}
              {linea.profesional.id === null && " (ya no está en el equipo)"} · {formatearMonto(linea.precio)}
            </span>
            {atenuada && <span className="sr-only"> (no entra en el filtro)</span>}
          </li>
        )
      })}
    </ul>
  )
}

export function Medios({ pagos }: { pagos: FilaDeReporte["pagos"] }) {
  if (!pagos || pagos.length === 0) return <span className="text-muted-foreground">Sin pago (cortesía)</span>
  const dividido = pagos.length > 1
  return (
    <ul className="space-y-0.5">
      {pagos.map((pago) => (
        <li key={pago.id}>
          {pago.nombreMedio}
          {dividido && <span className="text-muted-foreground tabular-nums"> {formatearMonto(pago.monto)}</span>}
        </li>
      ))}
    </ul>
  )
}

interface HistorialDeCobrosProps {
  reporte: Reporte
  /** Mientras llega otra página o el resultado de otros filtros. */
  actualizando: boolean
  onPagina: (pagina: number) => void
  /** Hay filtro de profesional o de servicio: se resaltan las líneas que lo cumplen. */
  resaltarCoincidencias: boolean
  /** Sólo para quien puede anular lo cobrado (el dueño): agrega "Anular" a cada fila. */
  onAnular?: (fila: FilaDeReporte) => void
  /** Llevar el foco al título, en cuanto se dibuje: después de anular, la fila del botón ya no está. */
  enfocarTitulo?: boolean
  onTituloEnfocado?: () => void
}

/**
 * Cada atención cobrada del período: cuándo, en qué turno, a quién, qué se
 * hizo y quién lo hizo y, para dueño y encargado, el total y cómo se pagó.
 * El dueño puede anular desde acá cualquier cobro, también de días anteriores.
 */
export function HistorialDeCobros({
  reporte,
  actualizando,
  onPagina,
  resaltarCoincidencias,
  onAnular,
  enfocarTitulo = false,
  onTituloEnfocado,
}: HistorialDeCobrosProps) {
  const idDelTitulo = useId()
  const seccion = useRef<HTMLElement>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  const delNegocio = reporte.alcance === "negocio"
  const anula = delNegocio && onAnular !== undefined
  const cantidad = reporte.total ?? reporte.resumen.cantidad
  const { pagina, paginas } = reporte

  useEffect(() => {
    if (!enfocarTitulo) return
    titulo.current?.focus()
    onTituloEnfocado?.()
  }, [enfocarTitulo, onTituloEnfocado])

  // Al cambiar de página se vuelve al principio de la tabla: los botones
  // están abajo y la página nueva empieza arriba.
  const irA = (otra: number) => {
    onPagina(otra)
    seccion.current?.scrollIntoView({ block: "start", behavior: "smooth" })
  }

  const anchoMinimo = anula ? "min-w-[860px]" : delNegocio ? "min-w-[760px]" : "min-w-[560px]"

  return (
    <section ref={seccion} aria-labelledby={idDelTitulo} className="bg-card border border-border/50 rounded-xl scroll-mt-24">
      <div className="flex flex-wrap items-baseline justify-between gap-2 p-5 border-b border-border/50">
        <h2 id={idDelTitulo} ref={titulo} tabIndex={-1} className={cn("font-semibold text-foreground rounded", ANILLO_DE_FOCO)}>
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
        // `relative` no es decorativo: los `sr-only` de la tabla (el título, la
        // columna "Acciones", el "no entra en el filtro") son `position:
        // absolute`. Sin un ancestro posicionado dentro del scroll se ubicaban
        // respecto de la página, fuera del contenedor que recorta, y la
        // estiraban: en el teléfono la página entera se corría de costado.
        <div className="relative overflow-x-auto">
          <table className={cn("w-full text-sm", anchoMinimo)}>
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
                {anula && (
                  <th scope="col" className="px-5 py-2.5 font-medium">
                    <span className="sr-only">Acciones</span>
                  </th>
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
                    <Servicios fila={fila} resaltar={resaltarCoincidencias} />
                  </td>
                  {delNegocio && (
                    <>
                      <td className="px-3 py-3 text-right font-semibold text-foreground tabular-nums whitespace-nowrap">
                        {fila.total !== undefined ? formatearMonto(fila.total) : "—"}
                      </td>
                      <td className="px-5 py-3 text-foreground">
                        <Medios pagos={fila.pagos} />
                      </td>
                    </>
                  )}
                  {anula && (
                    <td className="px-5 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => onAnular(fila)}
                        disabled={actualizando}
                        aria-label={`Anular el cobro de ${fila.cliente.nombre} del ${diaCorto(fila.cobradaEn)} a ${horaConArticulo(fila.cobradaEn)}`}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                          ANILLO_DE_FOCO
                        )}
                      >
                        <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                        Anular
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Paginador nombre="Páginas del historial" pagina={pagina} paginas={paginas} actualizando={actualizando} onPagina={irA} />
    </section>
  )
}
