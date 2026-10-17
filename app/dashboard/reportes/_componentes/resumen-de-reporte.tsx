"use client"

import { useId, type ReactNode } from "react"
import { DollarSign, Receipt, TrendingUp, type LucideIcon } from "lucide-react"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { TARJETA_DEL_PANEL, TITULO_DE_TARJETA } from "@/components/panel/estilos"
import { formatearMonto } from "@/lib/dinero"
import { cn } from "@/lib/utils"
import type { Reporte } from "../_datos"

interface PropsDeCifra {
  titulo: string
  valor: string
  icono: LucideIcon
  /** La cifra principal: el ícono va sobre el lima fuerte en vez del suave. */
  principal?: boolean
  className?: string
}

/**
 * Una cifra del resumen en su tarjeta: qué es, el número grande y el ícono en
 * el lima de reportes. Un monto largo baja de renglón antes que salirse.
 */
export function Cifra({ titulo, valor, icono, principal = false, className }: PropsDeCifra) {
  return (
    <div className={cn(TARJETA_DEL_PANEL, "flex items-start justify-between gap-4 p-5 sm:p-6", className)}>
      <div className="min-w-0 space-y-2">
        <p className="text-sm text-pretty text-texto-2">{titulo}</p>
        <p className="text-[28px] leading-[1.1] font-medium tracking-[-1px] tabular-nums [overflow-wrap:anywhere] sm:text-[32px]">
          {valor}
        </p>
      </div>
      <CuadroDeIcono icono={icono} color="lima" activo={principal} />
    </div>
  )
}

interface Renglon {
  clave: string
  nombre: ReactNode
  detalle?: string
  monto: number
}

/**
 * Un desglose del resumen. `renglones` en `null` es un desglose que con los
 * filtros elegidos no se puede calcular (el servidor lo manda así): se dice
 * por qué con `sinDesglose`, en vez de una lista vacía que se leería como
 * "no hubo cobros".
 *
 * Debajo de cada renglón, una barra en lima con su parte contra el más alto
 * de la lista. Es para mirar de un vistazo: el monto está escrito al lado, así
 * que para el lector de pantalla la barra no existe.
 */
function Desglose({ titulo, renglones, sinDesglose }: { titulo: string; renglones: Renglon[] | null; sinDesglose: string }) {
  const idDelTitulo = useId()
  const mayor = renglones ? Math.max(0, ...renglones.map((renglon) => renglon.monto)) : 0

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <h2 id={idDelTitulo} className={TITULO_DE_TARJETA}>
        {titulo}
      </h2>
      {renglones === null ? (
        <p className="mt-3 text-sm text-pretty text-texto-2">{sinDesglose}</p>
      ) : renglones.length === 0 ? (
        <p className="mt-3 text-sm text-texto-2">Sin cobros en este período.</p>
      ) : (
        <ul className="mt-3 divide-y divide-borde">
          {renglones.map((renglon) => (
            <li key={renglon.clave} className="py-3 text-sm last:pb-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 break-words">
                  <span className="font-medium">{renglon.nombre}</span>
                  {renglon.detalle && <span className="block text-xs text-texto-2">{renglon.detalle}</span>}
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{formatearMonto(renglon.monto)}</span>
              </div>
              {mayor > 0 && (
                <span aria-hidden="true" className="mt-2 block h-1.5 overflow-hidden rounded-full bg-superficie">
                  {/* El ancho sale del dato: no hay una clase para cada porcentaje. */}
                  <span
                    className="block h-full rounded-full bg-lima"
                    style={{ width: `${Math.max(0, (renglon.monto / mayor) * 100)}%` }}
                  />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const cuantos = (cantidad: number, singular: string, plural: string) =>
  `${cantidad} ${cantidad === 1 ? singular : plural}`

/** Lo que ya no está en el catálogo o en el equipo se sigue viendo, marcado. */
function conMarca(nombre: string, sigue: boolean, marca: string): ReactNode {
  if (sigue) return nombre
  return (
    <>
      {nombre} <span className="text-xs font-normal text-texto-2">({marca})</span>
    </>
  )
}

/** Por qué no hay desglose por medio: un pago es de la atención entera, no de una línea. */
const SIN_DESGLOSE_POR_MEDIO = "No se puede repartir por medio de pago cuando filtras por profesional o servicio."
/** Y al revés: lo pagado con un medio no se puede repartir entre las líneas. */
const SIN_DESGLOSE_POR_PROFESIONAL = "No se puede repartir por profesional cuando filtras por medio de pago."
const SIN_DESGLOSE_POR_SERVICIO = "No se puede repartir por servicio cuando filtras por medio de pago."

interface PropsDeResumenDeReporte {
  reporte: Reporte
  /**
   * El título de la cifra principal, que dice qué se sumó según los filtros
   * (`rotuloDeIngresos`): "Ingresos · servicios de Carla", "Cobrado en efectivo".
   */
  rotuloDeIngresos: string
}

/**
 * Las cifras del período y su desglose. Al profesional (`alcance: "propio"`)
 * todo le habla en segunda persona, porque son sus números y no los del
 * negocio: lo que atendió, sin totales del local ni medios de pago.
 *
 * Los ingresos van primero y, entre sm y xl, a lo ancho: con tres tarjetas por
 * fila un monto largo no entraba en las de una tableta.
 */
export function ResumenDeReporte({ reporte, rotuloDeIngresos }: PropsDeResumenDeReporte) {
  const { resumen, alcance } = reporte
  const propio = alcance === "propio"

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Cifra
          titulo={rotuloDeIngresos}
          valor={formatearMonto(resumen.ingresos)}
          icono={DollarSign}
          principal
          className="sm:col-span-2 xl:col-span-1"
        />
        <Cifra titulo={propio ? "Tus atenciones" : "Atenciones"} valor={String(resumen.cantidad)} icono={Receipt} />
        <Cifra
          titulo={propio ? "Tu promedio por atención" : "Ticket promedio"}
          valor={resumen.ticketPromedio === null ? "—" : formatearMonto(resumen.ticketPromedio)}
          icono={TrendingUp}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        {/* Al profesional, el desglose por profesional sería una sola fila: la suya, que ya está arriba. */}
        {!propio && (
          <Desglose
            titulo="Por profesional"
            sinDesglose={SIN_DESGLOSE_POR_PROFESIONAL}
            renglones={
              resumen.porProfesional?.map((grupo) => ({
                clave: grupo.clave,
                nombre: conMarca(grupo.nombre, grupo.id !== null, "ya no está en el equipo"),
                detalle: cuantos(grupo.servicios, "servicio", "servicios"),
                monto: grupo.monto,
              })) ?? null
            }
          />
        )}
        <Desglose
          titulo={propio ? "Lo que atendiste, por servicio" : "Por servicio"}
          sinDesglose={SIN_DESGLOSE_POR_SERVICIO}
          renglones={
            resumen.porServicio?.map((grupo) => ({
              clave: grupo.clave,
              nombre: conMarca(grupo.nombre, grupo.id !== null, "fuera del catálogo"),
              detalle: cuantos(grupo.cantidad, "vez", "veces"),
              monto: grupo.monto,
            })) ?? null
          }
        />
        {/* Al profesional la clave no le llega (`undefined`): los medios de pago no son suyos. */}
        {resumen.porMedio !== undefined && (
          <Desglose
            titulo="Por medio de pago"
            sinDesglose={SIN_DESGLOSE_POR_MEDIO}
            renglones={
              resumen.porMedio?.map((grupo) => ({ clave: grupo.medio, nombre: grupo.nombre, monto: grupo.monto })) ?? null
            }
          />
        )}
      </div>
    </div>
  )
}
