"use client"

import { useId } from "react"
import { Ban, CircleSlash, DollarSign } from "lucide-react"
import { TARJETA_DEL_PANEL, TITULO_DE_TARJETA } from "@/components/panel/estilos"
import { formatearMonto } from "@/lib/dinero"
import { formatearHora } from "@/lib/fechas"
import { cn } from "@/lib/utils"
import type { FilaAnulada, ReporteDeAnuladas } from "../_datos"
import { CLASES_DE_CELDA, ENCABEZADO_DE_COLUMNA, MediosDeLaFila, SinFilas, diaCorto } from "./historial-de-cobros"
import { Paginador } from "./paginador"
import { Cifra } from "./resumen-de-reporte"
import { useIrALaSeccion } from "./usar-ir-a-la-seccion"

/** Cuántas se anularon en el período y cuánto de eso ya se había cobrado: lo que dejó de sumar. */
export function ResumenDeAnuladas({ reporte }: { reporte: ReporteDeAnuladas }) {
  const { cantidad, montoAnulado } = reporte.resumen
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Cifra titulo="Atenciones anuladas" valor={String(cantidad)} icono={Ban} />
      <Cifra titulo="Cobrado que se anuló" valor={formatearMonto(montoAnulado)} icono={DollarSign} />
    </div>
  )
}

/** Día y hora de un instante, en dos renglones, como en el historial de cobros. */
function Momento({ iso }: { iso: string }) {
  return (
    <time dateTime={iso}>
      <span className="block font-medium">{diaCorto(iso)}</span>
      <span className="block text-texto-2 tabular-nums">{formatearHora(iso)}</span>
    </time>
  )
}

function Servicios({ fila }: { fila: FilaAnulada }) {
  if (fila.lineas.length === 0) return <span className="text-texto-2">Sin servicios</span>
  return (
    <ul className="space-y-1">
      {fila.lineas.map((linea) => (
        <li key={linea.id}>
          {linea.servicio}{" "}
          <span className="text-texto-2">
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
  if (!fila.estabaCobrada) return <span className="text-texto-2">No estaba cobrada</span>
  return (
    <div className="space-y-1">
      <p>
        Estaba cobrada
        {fila.cobradaEn && (
          <span className="text-texto-2">
            {" "}
            · <time dateTime={fila.cobradaEn}>{diaCorto(fila.cobradaEn)}, {formatearHora(fila.cobradaEn)}</time>
          </span>
        )}
      </p>
      <MediosDeLaFila pagos={fila.pagos} />
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
  const { pagina, paginas, total: cantidad } = reporte
  const { seccion, irA } = useIrALaSeccion(onPagina, actualizando, reporte)

  return (
    <section
      ref={seccion}
      aria-labelledby={idDelTitulo}
      // La fila fija de arriba del teléfono mide 68 px: el principio de la sección no queda debajo.
      className={cn(TARJETA_DEL_PANEL, "scroll-mt-20 lg:scroll-mt-6")}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
        <h2 id={idDelTitulo} className={TITULO_DE_TARJETA}>
          Historial de anuladas
        </h2>
        <p className="text-sm text-texto-2 tabular-nums">{cantidad === 1 ? "1 atención" : `${cantidad} atenciones`}</p>
      </div>

      {reporte.filas.length === 0 ? (
        <SinFilas icono={CircleSlash} titulo="No se anuló nada en este período">
          Lo que se anule, cobrado o no, aparece acá con quién lo anuló y por qué.
        </SinFilas>
      ) : (
        // `relative`, como en el historial de cobros: el título `sr-only` de la
        // tabla es `position: absolute` y, sin un ancestro posicionado dentro
        // del scroll, estiraba la página de costado.
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <caption className="sr-only">
              Atenciones anuladas, página {pagina} de {paginas}
            </caption>
            <thead>
              <tr className="border-y border-borde bg-crema text-left">
                <th scope="col" className={ENCABEZADO_DE_COLUMNA}>
                  Anulada
                </th>
                <th scope="col" className={ENCABEZADO_DE_COLUMNA}>
                  Por
                </th>
                <th scope="col" className={ENCABEZADO_DE_COLUMNA}>
                  Cliente
                </th>
                <th scope="col" className={ENCABEZADO_DE_COLUMNA}>
                  Servicios
                </th>
                <th scope="col" className={cn(ENCABEZADO_DE_COLUMNA, "text-right")}>
                  Total
                </th>
                <th scope="col" className={ENCABEZADO_DE_COLUMNA}>
                  Cobro
                </th>
                <th scope="col" className={ENCABEZADO_DE_COLUMNA}>
                  Motivo
                </th>
              </tr>
            </thead>
            <tbody
              className={cn(
                "divide-y divide-borde transition-opacity duration-200 ease-suave",
                actualizando && "opacity-60"
              )}
            >
              {reporte.filas.map((fila) => (
                <tr key={fila.id}>
                  <td className={cn(CLASES_DE_CELDA, "whitespace-nowrap")}>
                    <Momento iso={fila.anuladaEn} />
                  </td>
                  <td className={cn(CLASES_DE_CELDA, "break-words")}>
                    {/* El nombre se copia al anular y queda aunque la persona se vaya: sólo falta si no se registró. */}
                    {fila.anuladaPor ?? <span className="text-texto-2">Sin registro</span>}
                  </td>
                  <td className={cn(CLASES_DE_CELDA, "font-medium break-words")}>{fila.cliente.nombre}</td>
                  <td className={CLASES_DE_CELDA}>
                    <Servicios fila={fila} />
                  </td>
                  <td className={cn(CLASES_DE_CELDA, "text-right font-semibold whitespace-nowrap tabular-nums")}>
                    {formatearMonto(fila.total)}
                  </td>
                  <td className={CLASES_DE_CELDA}>
                    <Cobro fila={fila} />
                  </td>
                  <td className={cn(CLASES_DE_CELDA, "max-w-[16rem] break-words")}>
                    {fila.motivoDeAnulacion ?? <span className="text-texto-2">Sin motivo</span>}
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
