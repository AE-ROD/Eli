"use client"

import { useId, type ReactNode } from "react"
import { DollarSign, Receipt, TrendingUp, type LucideIcon } from "lucide-react"
import { CuadroDeIcono } from "@/components/comunes/icono-de-modulo"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { RELLENO_DE_TARJETA, TARJETA_DEL_PANEL, TITULO_DE_TARJETA } from "@/components/panel/estilos"
import { formatearMonto } from "@/lib/dinero"
import { cn } from "@/lib/utils"
import { vocabularioDe } from "@/lib/vocabulario"
import type { Reporte } from "../_datos"
import { frasesDeLosReportes } from "../_frases"

interface PropsDeCifra {
  titulo: string
  valor: string
  icono: LucideIcon
  /** La cifra principal: el ícono va sobre el lima fuerte en vez del suave. */
  principal?: boolean
  /** Una frase que dice cómo leer el número ("7 de cada 10 horas…"), debajo de él. */
  lectura?: string | null
  className?: string
}

/**
 * Una cifra del resumen en su tarjeta: qué es, el número grande y el ícono en
 * el lima de reportes. Un monto largo baja de renglón antes que salirse.
 *
 * En el celular va compacta, de a dos por fila: relleno de 16 px, número de
 * 22 px y, salvo en la principal, sin ícono, que le quitaba medio ancho.
 */
export function Cifra({ titulo, valor, icono, principal = false, lectura, className }: PropsDeCifra) {
  return (
    <div
      className={cn(
        TARJETA_DEL_PANEL,
        RELLENO_DE_TARJETA,
        "flex items-start justify-between gap-3 escritorio:gap-4",
        className
      )}
    >
      <div className="min-w-0 space-y-1.5 escritorio:space-y-2">
        <p className="text-[13px] leading-snug text-pretty text-texto-2 escritorio:text-sm">{titulo}</p>
        <p
          className={cn(
            "leading-[1.1] font-medium tracking-[-0.5px] tabular-nums [overflow-wrap:anywhere] escritorio:text-[32px] escritorio:tracking-[-1px]",
            principal ? "text-[28px]" : "text-[22px]"
          )}
        >
          {valor}
        </p>
        {lectura && <p className="text-xs text-pretty text-texto-2 escritorio:text-sm">{lectura}</p>}
      </div>
      <CuadroDeIcono icono={icono} color="lima" activo={principal} className={cn(!principal && "max-escritorio:hidden")} />
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
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, RELLENO_DE_TARJETA)}>
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
 * Los ingresos van primero y, por debajo de xl, a lo ancho: con tres tarjetas
 * por fila un monto largo no entraba en las de una tableta. En el celular, las
 * otras dos quedan de a dos, compactas, debajo.
 */
export function ResumenDeReporte({ reporte, rotuloDeIngresos }: PropsDeResumenDeReporte) {
  const { resumen, alcance } = reporte
  const propio = alcance === "propio"
  // Con las palabras del rubro: "Por odontólogo", "Por prestación".
  const { resumen: frases } = frasesDeLosReportes(vocabularioDe(useRubroDelPanel()).palabras)

  return (
    <div className="space-y-3 escritorio:space-y-4">
      <div className="grid grid-cols-2 gap-3 escritorio:gap-4 xl:grid-cols-3">
        <Cifra
          titulo={rotuloDeIngresos}
          valor={formatearMonto(resumen.ingresos)}
          icono={DollarSign}
          principal
          className="col-span-2 xl:col-span-1"
        />
        <Cifra titulo={propio ? "Tus atenciones" : "Atenciones"} valor={String(resumen.cantidad)} icono={Receipt} />
        <Cifra
          titulo={propio ? "Tu promedio por atención" : "Promedio por atención"}
          valor={resumen.ticketPromedio === null ? "—" : formatearMonto(resumen.ticketPromedio)}
          icono={TrendingUp}
        />
      </div>

      {/* Sólo si hubo: lo devuelto de paquetes ya está restado arriba y en su medio de pago. */}
      {resumen.devoluciones && (
        <p className={cn(TARJETA_DEL_PANEL, "flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm escritorio:px-6")}>
          <span className="min-w-0 text-pretty">
            <span className="font-medium">Devoluciones de paquetes</span>{" "}
            <span className="text-texto-2">
              ({cuantos(resumen.devoluciones.cantidad, "devolución", "devoluciones")}, ya{" "}
              {resumen.devoluciones.cantidad === 1 ? "restada" : "restadas"} de lo cobrado)
            </span>
          </span>
          <span className="font-semibold tabular-nums">{formatearMonto(-resumen.devoluciones.monto)}</span>
        </p>
      )}

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-3 escritorio:gap-4">
        {/* Al profesional, el desglose por profesional sería una sola fila: la suya, que ya está arriba. */}
        {!propio && (
          <Desglose
            titulo={frases.porProfesional}
            sinDesglose={frases.sinDesglosePorProfesional}
            renglones={
              resumen.porProfesional?.map((grupo) => ({
                clave: grupo.clave,
                nombre: conMarca(grupo.nombre, grupo.id !== null, "ya no está en el equipo"),
                detalle: frases.cuantos(grupo.servicios),
                monto: grupo.monto,
              })) ?? null
            }
          />
        )}
        <Desglose
          titulo={propio ? frases.loQueAtendisteDeCadaServicio : frases.porServicio}
          sinDesglose={frases.sinDesglosePorServicio}
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
            sinDesglose={frases.sinDesglosePorMedio}
            renglones={
              resumen.porMedio?.map((grupo) => ({ clave: grupo.medio, nombre: grupo.nombre, monto: grupo.monto })) ?? null
            }
          />
        )}
      </div>
    </div>
  )
}
