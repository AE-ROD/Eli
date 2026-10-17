"use client"

import { useEffect, useId, useRef } from "react"
import { Ban, Receipt } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { Insignia } from "@/components/comunes/insignia"
import { TARJETA_DEL_PANEL, TITULO_DE_TARJETA } from "@/components/panel/estilos"
import { formatearMonto } from "@/lib/dinero"
import { formatearHora, horaConArticulo } from "@/lib/fechas"
import { TURNOS } from "@/lib/reportes"
import { cn } from "@/lib/utils"
import type { FilaDeReporte, Reporte } from "../_datos"
import { Paginador } from "./paginador"
import { useIrALaSeccion } from "./usar-ir-a-la-seccion"

/** `mar, 6 oct`: el día del cobro, corto, en la hora de quien mira. */
export function diaCorto(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" })
}

const nombreDeTurno = (id: string) => TURNOS.find((turno) => turno.id === id)?.nombre ?? id

/** Las celdas de los historiales: arriba, con el mismo relleno; la primera y la última, con el de la tarjeta. */
export const CLASES_DE_CELDA = "px-3 py-3.5 align-top first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6"
export const ENCABEZADO_DE_COLUMNA = "px-3 py-3 text-xs font-medium text-texto-2 first:pl-5 last:pr-5 sm:first:pl-6 sm:last:pr-6"

/**
 * Los servicios de la atención. Con filtro de profesional o de servicio
 * (`resaltar`), las líneas que lo cumplen (`coincide`) son las que suman en el
 * resumen: van marcadas con el lima de reportes, y las demás en gris, con un
 * aviso para el lector de pantalla. Sin esos filtros se ven todas iguales.
 *
 * El gris de las que no entran es el del texto secundario, sin transparencia:
 * con la opacidad de antes quedaba por debajo del contraste mínimo.
 */
function Servicios({ fila, resaltar }: { fila: FilaDeReporte; resaltar: boolean }) {
  return (
    <ul className="space-y-1">
      {fila.lineas.map((linea) => {
        const destacada = resaltar && linea.coincide
        const atenuada = resaltar && !linea.coincide
        return (
          <li key={linea.id} className={cn(atenuada && "text-texto-2")}>
            <span className={cn(destacada && "rounded-[6px] bg-lima-suave px-1 font-medium box-decoration-clone")}>
              {linea.servicio}
            </span>{" "}
            <span className="text-texto-2">
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

export function MediosDeLaFila({ pagos }: { pagos: FilaDeReporte["pagos"] }) {
  if (!pagos || pagos.length === 0) return <span className="text-texto-2">Sin pago (cortesía)</span>
  const dividido = pagos.length > 1
  return (
    <ul className="space-y-1">
      {pagos.map((pago) => (
        <li key={pago.id}>
          {pago.nombreMedio}
          {dividido && <span className="text-texto-2 tabular-nums"> {formatearMonto(pago.monto)}</span>}
        </li>
      ))}
    </ul>
  )
}

/** Cuando el período no tiene nada: el ícono del reporte en lima, qué pasó y qué probar. */
export function SinFilas({ icono, titulo, children }: { icono: typeof Receipt; titulo: string; children: string }) {
  return (
    <div className="flex flex-col items-center px-5 pb-10 pt-6 text-center">
      <CuadroDeIcono icono={icono} color="lima" tamano="lg" />
      <p className="mt-4 font-medium">{titulo}</p>
      <p className="mt-1 max-w-sm text-sm text-pretty text-texto-2">{children}</p>
    </div>
  )
}

interface PropsDeHistorialDeCobros {
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
}: PropsDeHistorialDeCobros) {
  const idDelTitulo = useId()
  const titulo = useRef<HTMLHeadingElement>(null)
  const delNegocio = reporte.alcance === "negocio"
  const anula = delNegocio && onAnular !== undefined
  const cantidad = reporte.total ?? reporte.resumen.cantidad
  const { pagina, paginas } = reporte
  const { seccion, irA } = useIrALaSeccion(onPagina, actualizando, reporte)

  useEffect(() => {
    if (!enfocarTitulo) return
    titulo.current?.focus()
    onTituloEnfocado?.()
  }, [enfocarTitulo, onTituloEnfocado])

  const anchoMinimo = anula ? "min-w-[880px]" : delNegocio ? "min-w-[780px]" : "min-w-[560px]"

  return (
    <section
      ref={seccion}
      aria-labelledby={idDelTitulo}
      // La fila fija de arriba del teléfono mide 68 px: el principio de la sección no queda debajo.
      className={cn(TARJETA_DEL_PANEL, "scroll-mt-20 lg:scroll-mt-6")}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
        <h2
          id={idDelTitulo}
          ref={titulo}
          tabIndex={-1}
          className={cn(TITULO_DE_TARJETA, "rounded-[10px] anillo-foco")}
        >
          Historial de cobros
        </h2>
        <p className="text-sm text-texto-2 tabular-nums">{cantidad === 1 ? "1 atención" : `${cantidad} atenciones`}</p>
      </div>

      {reporte.filas.length === 0 ? (
        <SinFilas icono={Receipt} titulo="No hay atenciones cobradas">
          Prueba con otro período o con otros filtros.
        </SinFilas>
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
              <tr className="border-y border-borde bg-crema text-left">
                <th scope="col" className={ENCABEZADO_DE_COLUMNA}>
                  Cobrada
                </th>
                <th scope="col" className={ENCABEZADO_DE_COLUMNA}>
                  Turno
                </th>
                <th scope="col" className={ENCABEZADO_DE_COLUMNA}>
                  Cliente
                </th>
                <th scope="col" className={ENCABEZADO_DE_COLUMNA}>
                  Servicios
                </th>
                {delNegocio && (
                  <>
                    <th scope="col" className={cn(ENCABEZADO_DE_COLUMNA, "text-right")}>
                      Total
                    </th>
                    <th scope="col" className={ENCABEZADO_DE_COLUMNA}>
                      Medios
                    </th>
                  </>
                )}
                {anula && (
                  <th scope="col" className={ENCABEZADO_DE_COLUMNA}>
                    <span className="sr-only">Acciones</span>
                  </th>
                )}
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
                    <time dateTime={fila.cobradaEn}>
                      <span className="block font-medium">{diaCorto(fila.cobradaEn)}</span>
                      <span className="block text-texto-2 tabular-nums">{formatearHora(fila.cobradaEn)}</span>
                    </time>
                  </td>
                  <td className={cn(CLASES_DE_CELDA, "whitespace-nowrap")}>
                    <Insignia>{nombreDeTurno(fila.turno)}</Insignia>
                  </td>
                  <td className={cn(CLASES_DE_CELDA, "font-medium break-words")}>{fila.cliente.nombre}</td>
                  <td className={CLASES_DE_CELDA}>
                    <Servicios fila={fila} resaltar={resaltarCoincidencias} />
                  </td>
                  {delNegocio && (
                    <>
                      <td className={cn(CLASES_DE_CELDA, "text-right font-semibold whitespace-nowrap tabular-nums")}>
                        {fila.total !== undefined ? formatearMonto(fila.total) : "—"}
                      </td>
                      <td className={CLASES_DE_CELDA}>
                        <MediosDeLaFila pagos={fila.pagos} />
                      </td>
                    </>
                  )}
                  {anula && (
                    <td className={cn(CLASES_DE_CELDA, "py-2.5 text-right")}>
                      <Boton
                        variante="fantasma"
                        tamano="sm"
                        onClick={() => onAnular(fila)}
                        disabled={actualizando}
                        aria-label={`Anular el cobro de ${fila.cliente.nombre} del ${diaCorto(fila.cobradaEn)} a ${horaConArticulo(fila.cobradaEn)}`}
                        className="px-2.5 text-error hover:bg-error/8"
                      >
                        <Ban aria-hidden="true" className="size-4" strokeWidth={1.75} />
                        Anular
                      </Boton>
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
