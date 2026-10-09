"use client"

import { useId, useRef } from "react"
import { Ban, CircleSlash, DollarSign } from "lucide-react"
import { formatearMonto } from "@/lib/dinero"
import { formatearHora } from "@/lib/fechas"
import { cn } from "@/lib/utils"
import type { FilaAnulada, ReporteDeAnuladas } from "../_datos"
import { Medios, diaCorto } from "./historial-de-cobros"
import { Paginador } from "./paginador"
import { Cifra } from "./resumen-de-reporte"

/** Cuántas se anularon en el período y cuánto de eso ya se había cobrado: lo que dejó de sumar. */
export function ResumenDeAnuladas({ reporte }: { reporte: ReporteDeAnuladas }) {
  const { cantidad, montoAnulado } = reporte.resumen
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Cifra titulo="Atenciones anuladas" valor={String(cantidad)} icono={Ban} />
      <Cifra titulo="Cobrado que se anuló" valor={formatearMonto(montoAnulado)} icono={DollarSign} />
    </div>
  )
}

/** Día y hora de un instante, en dos renglones, como en el historial de cobros. */
function Momento({ iso }: { iso: string }) {
  return (
    <time dateTime={iso}>
      <span className="block text-foreground">{diaCorto(iso)}</span>
      <span className="block text-muted-foreground tabular-nums">{formatearHora(iso)}</span>
    </time>
  )
}

function Servicios({ fila }: { fila: FilaAnulada }) {
  if (fila.lineas.length === 0) return <span className="text-muted-foreground">Sin servicios</span>
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

/** Si había llegado a cobrarse: cuándo y con qué. Lo anulado sin cobrar no había sumado nada. */
function Cobro({ fila }: { fila: FilaAnulada }) {
  if (!fila.estabaCobrada) return <span className="text-muted-foreground">No estaba cobrada</span>
  return (
    <div className="space-y-1">
      <p className="text-foreground">
        Estaba cobrada
        {fila.cobradaEn && (
          <span className="text-muted-foreground">
            {" "}
            · <time dateTime={fila.cobradaEn}>{diaCorto(fila.cobradaEn)}, {formatearHora(fila.cobradaEn)}</time>
          </span>
        )}
      </p>
      <Medios pagos={fila.pagos} />
    </div>
  )
}

interface HistorialDeAnuladasProps {
  reporte: ReporteDeAnuladas
  /** Mientras llega otra página u otro período. */
  actualizando: boolean
  onPagina: (pagina: number) => void
}

/**
 * Lo anulado en el período (PRODUCTO.md, sección 7: lo anulado "queda en el
 * historial como anulada"): quién lo anuló, cuándo y por qué, si se había
 * cobrado, el total y cómo se había pagado. Sólo para dueño y encargado.
 */
export function HistorialDeAnuladas({ reporte, actualizando, onPagina }: HistorialDeAnuladasProps) {
  const idDelTitulo = useId()
  const seccion = useRef<HTMLElement>(null)
  const { pagina, paginas, total: cantidad } = reporte

  const irA = (otra: number) => {
    onPagina(otra)
    seccion.current?.scrollIntoView({ block: "start", behavior: "smooth" })
  }

  return (
    <section ref={seccion} aria-labelledby={idDelTitulo} className="bg-card border border-border/50 rounded-xl scroll-mt-24">
      <div className="flex flex-wrap items-baseline justify-between gap-2 p-5 border-b border-border/50">
        <h2 id={idDelTitulo} className="font-semibold text-foreground">
          Historial de anuladas
        </h2>
        <p className="text-sm text-muted-foreground">{cantidad === 1 ? "1 atención" : `${cantidad} atenciones`}</p>
      </div>

      {reporte.filas.length === 0 ? (
        <div className="text-center py-12 px-5">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
            <CircleSlash className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
          </div>
          <p className="font-medium text-foreground">No se anuló nada en este período</p>
          <p className="text-sm text-muted-foreground mt-1">
            Lo que se anule, cobrado o no, aparece acá con quién lo anuló y por qué.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[880px]">
            <caption className="sr-only">
              Atenciones anuladas, página {pagina} de {paginas}
            </caption>
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border/50">
                <th scope="col" className="px-5 py-2.5 font-medium">Anulada</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Por</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Cliente</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Servicios</th>
                <th scope="col" className="px-3 py-2.5 font-medium text-right">Total</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Cobro</th>
                <th scope="col" className="px-5 py-2.5 font-medium">Motivo</th>
              </tr>
            </thead>
            <tbody className={cn("divide-y divide-border/50", actualizando && "opacity-60")}>
              {reporte.filas.map((fila) => (
                <tr key={fila.id} className="align-top">
                  <td className="px-5 py-3 whitespace-nowrap">
                    <Momento iso={fila.anuladaEn} />
                  </td>
                  <td className="px-3 py-3 text-foreground">
                    {fila.anuladaPor ?? <span className="text-muted-foreground">Ya no está en el negocio</span>}
                  </td>
                  <td className="px-3 py-3 text-foreground">{fila.cliente.nombre}</td>
                  <td className="px-3 py-3 text-foreground">
                    <Servicios fila={fila} />
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-foreground tabular-nums whitespace-nowrap">
                    {formatearMonto(fila.total)}
                  </td>
                  <td className="px-3 py-3">
                    <Cobro fila={fila} />
                  </td>
                  <td className="px-5 py-3 text-foreground max-w-[16rem] break-words">
                    {fila.motivoDeAnulacion ?? <span className="text-muted-foreground">Sin motivo</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Paginador nombre="Páginas de anuladas" pagina={pagina} paginas={paginas} actualizando={actualizando} onPagina={irA} />
    </section>
  )
}
