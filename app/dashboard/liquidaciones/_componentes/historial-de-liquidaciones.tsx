"use client"

import { useId, useRef, useState } from "react"
import Link from "next/link"
import { ChevronRight, History, RefreshCw } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { Selector } from "@/components/comunes/selector"
import { Aviso } from "@/components/panel/aviso"
import { useRubroDelPanel } from "@/components/panel/contexto-rubro"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { EstadoVacio } from "@/components/panel/estado-vacio"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import type { ResumenDeLiquidacion } from "@/lib/liquidacion"
import { cn } from "@/lib/utils"
import { conMayuscula, vocabularioDe } from "@/lib/vocabulario"
import { LIQUIDACIONES_POR_PAGINA, leerHistorialDeLiquidaciones } from "../_datos"
import { InsigniaDeEstado, pesos } from "./piezas"

interface Props {
  /** La primera página del historial, ya leída en el servidor. */
  liquidaciones: ResumenDeLiquidacion[]
  /** Si hay más que la primera página. */
  hayMas: boolean
  /** Quienes se pueden elegir en el filtro: el equipo, más quien aparezca en lo leído. */
  personas: { id: string; nombre: string }[]
}

/** Lo que se ve: las páginas leídas de una persona (o de todos) y si quedan más. */
interface Pagina {
  miembro: string
  liquidaciones: ResumenDeLiquidacion[]
  paginas: number
  hayMas: boolean
}

/**
 * Las liquidaciones cerradas, pagadas y anuladas, de la más nueva a la más
 * vieja, con su comprobante. Llegan de a `LIQUIDACIONES_POR_PAGINA` ("Ver
 * más" trae la siguiente) y se puede mirar una sola persona: el filtro se
 * pide al servidor, así no depende de lo que ya se trajo.
 */
export function HistorialDeLiquidaciones({ liquidaciones, hayMas, personas }: Props) {
  const idDelTitulo = useId()
  const vocabulario = vocabularioDe(useRubroDelPanel())
  const [vista, setVista] = useState<Pagina>({ miembro: "", liquidaciones, paginas: 1, hayMas })
  const [elegido, setElegido] = useState("")
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState("")
  /** El último pedido: una respuesta de un pedido anterior (otro filtro) se descarta. */
  const pedido = useRef(0)

  const opciones = [...new Map([...personas, ...vista.liquidaciones.map((l) => ({ id: l.memberId, nombre: l.miembro }))].map((p) => [p.id, p.nombre])).entries()]

  const leer = async (miembro: string, pagina: number) => {
    const este = ++pedido.current
    setCargando(true)
    setError("")
    const resultado = await leerHistorialDeLiquidaciones(pagina, miembro)
    if (este !== pedido.current) return
    setCargando(false)
    if (!resultado.ok) {
      // Lo que se ve ya no es lo elegido si cambió el filtro: no se deja como si lo fuera.
      if (miembro !== vista.miembro) setVista({ miembro, liquidaciones: [], paginas: 0, hayMas: false })
      return setError(resultado.error)
    }
    setVista((previa) => ({
      miembro,
      liquidaciones: pagina === 1 ? resultado.datos : [...previa.liquidaciones, ...resultado.datos],
      paginas: pagina,
      hayMas: resultado.datos.length === LIQUIDACIONES_POR_PAGINA,
    }))
  }

  const sinNada = vista.liquidaciones.length === 0 && !vista.hayMas && !cargando && !error

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta id={idDelTitulo} titulo="Historial" subtitulo="Cada liquidación con su comprobante" icono={{ figura: History }} />
      {liquidaciones.length === 0 && vista.miembro === "" && sinNada ? (
        <EstadoVacio className="mt-5">Todavía no se cerró ninguna liquidación.</EstadoVacio>
      ) : (
        <>
          {opciones.length > 1 && (
            <div className="mt-5 max-w-xs">
              <Selector
                etiqueta={conMayuscula(vocabulario.profesional)}
                value={elegido}
                onChange={(evento) => {
                  setElegido(evento.target.value)
                  void leer(evento.target.value, 1)
                }}
                opciones={opciones.map(([id, nombre]) => ({ valor: id, texto: nombre }))}
              >
                <option value="">Todos</option>
              </Selector>
            </div>
          )}
          {error && (
            <Aviso
              className="mt-4"
              accion={
                <Boton
                  variante="secundario"
                  tamano="sm"
                  onClick={() => void leer(elegido, elegido === vista.miembro ? vista.paginas + 1 : 1)}
                >
                  <RefreshCw aria-hidden="true" className="size-4" strokeWidth={2} />
                  Reintentar
                </Boton>
              }
            >
              {error}
            </Aviso>
          )}
          {sinNada ? (
            <EstadoVacio className="mt-5">Sin liquidaciones de esta persona.</EstadoVacio>
          ) : (
            <ul aria-busy={cargando} className={cn("mt-4 divide-y divide-borde/60", cargando && "opacity-60")}>
              {vista.liquidaciones.map((liquidacion) => (
                <li key={liquidacion.id}>
                  <Link
                    href={`/dashboard/liquidaciones/${liquidacion.id}`}
                    className="anillo-foco -mx-2 flex min-h-11 items-center gap-3 rounded-campo px-2 py-3 hover:bg-superficie"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{liquidacion.miembro}</p>
                      <p className="text-sm text-texto-2">{liquidacion.texto}</p>
                    </div>
                    <InsigniaDeEstado estado={liquidacion.estado} />
                    <span className={cn("tabular-nums font-medium", liquidacion.estado === "anulada" && "text-texto-2 line-through")}>
                      {pesos(liquidacion.totalCents)}
                    </span>
                    <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-texto-2" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {vista.hayMas && vista.miembro === elegido && (
            <div className="mt-4">
              <Boton variante="secundario" tamano="sm" cargando={cargando} onClick={() => void leer(elegido, vista.paginas + 1)}>
                Ver más
              </Boton>
            </div>
          )}
        </>
      )}
    </section>
  )
}
