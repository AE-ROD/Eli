"use client"

import { useEffect, useId, useState } from "react"
import { History, RefreshCw } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { Esqueleto } from "@/components/comunes/esqueleto"
import { Selector } from "@/components/comunes/selector"
import { Aviso } from "@/components/panel/aviso"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { EstadoVacio } from "@/components/panel/estado-vacio"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { cn } from "@/lib/utils"
import { Paginador } from "../../reportes/_componentes/paginador"
import {
  formatearPorcentaje,
  leerHistorial,
  type CambioDeComision,
  type FiltroDeHistorial,
  type HistorialDeComisiones,
} from "../_datos"

interface PropsDeHistorial {
  miembros: { id: string; nombre: string }[]
  /** Sube cada vez que se guarda un %: el historial se vuelve a leer. */
  version: number
}

/** `12 de octubre de 2026, 15:30`, en la hora del dispositivo. */
function cuandoParaLeer(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", { dateStyle: "long", timeStyle: "short" })
}

/** "el % por defecto", "Color" o "el producto Shampoo". */
function sobreQue(cambio: CambioDeComision): string {
  if (cambio.alcance === "service") return `en ${cambio.sobre ?? "un servicio"}`
  if (cambio.alcance === "product") return `del producto ${cambio.sobre ?? "borrado"}`
  return "por defecto"
}

/**
 * El valor del selector: vacío es todo el equipo, un id es un profesional y
 * `ex:` + nombre es alguien que ya se fue. Un id es un cuid: nunca empieza
 * con `ex:`.
 */
const PREFIJO_EX = "ex:"

function filtroDelSelector(valor: string): FiltroDeHistorial {
  if (valor.startsWith(PREFIJO_EX)) return { exMiembro: valor.slice(PREFIJO_EX.length) }
  return valor ? { miembro: valor } : {}
}

/**
 * El historial de cambios de % (#35): quién, cuándo, de cuánto a cuánto. Sin
 * filtro trae también a quienes ya no están en el equipo, con el nombre que
 * tenían al cambiarse, y a ellos también se los puede elegir en el filtro
 * (#119).
 */
export function HistorialDeComisionesTarjeta({ miembros, version }: PropsDeHistorial) {
  const idDelTitulo = useId()
  const [miembro, setMiembro] = useState("")
  const [pagina, setPagina] = useState(1)
  const [reintentos, setReintentos] = useState(0)
  const [historial, setHistorial] = useState<HistorialDeComisiones | null>(null)
  const [error, setError] = useState("")
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vigente = true
    leerHistorial(filtroDelSelector(miembro), pagina).then((resultado) => {
      if (!vigente) return
      setCargando(false)
      if (resultado.ok) {
        setHistorial(resultado.datos)
        setError("")
      } else setError(resultado.error)
    })
    return () => {
      vigente = false
    }
  }, [miembro, pagina, version, reintentos])

  const cambiarPagina = (otra: number) => {
    setCargando(true)
    setPagina(otra)
  }

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "overflow-hidden")}>
      <div className="space-y-4 p-5 sm:p-6">
        <EncabezadoDeTarjeta
          id={idDelTitulo}
          titulo="Historial de cambios"
          subtitulo="Quién cambió cada porcentaje, cuándo y de cuánto a cuánto."
          icono={{ figura: History }}
        />
        <div className="max-w-xs">
          <Selector
            etiqueta="Profesional"
            value={miembro}
            onChange={(evento) => {
              setCargando(true)
              setMiembro(evento.target.value)
              setPagina(1)
            }}
            opciones={[
              { valor: "", texto: "Todo el equipo" },
              ...miembros.map((m) => ({ valor: m.id, texto: m.nombre })),
              ...(historial?.exMiembros ?? []).map((nombre) => ({
                valor: `${PREFIJO_EX}${nombre}`,
                texto: `${nombre} (ya no está en el equipo)`,
              })),
            ]}
          />
        </div>

        {error && (
          <Aviso
            accion={
              <Boton variante="secundario" tamano="sm" onClick={() => setReintentos((previos) => previos + 1)}>
                <RefreshCw aria-hidden="true" className="size-4" strokeWidth={2} />
                Reintentar
              </Boton>
            }
          >
            {error}
          </Aviso>
        )}

        {!historial && cargando && (
          <div role="status" className="space-y-3">
            <span className="sr-only">Cargando el historial…</span>
            {[0, 1, 2].map((fila) => (
              <Esqueleto key={fila} />
            ))}
          </div>
        )}

        {historial && historial.cambios.length === 0 && (
          <EstadoVacio>Todavía no hay cambios de porcentaje{miembro ? " de este profesional" : ""}.</EstadoVacio>
        )}

        {historial && historial.cambios.length > 0 && (
          <ol aria-busy={cargando} className={cn("divide-y divide-borde", cargando && "opacity-60")}>
            {historial.cambios.map((cambio) => (
              <li key={cambio.id} className="py-3 text-sm">
                <p className="break-words">
                  <span className="font-medium">{cambio.quien}</span> cambió el % de{" "}
                  <span className="font-medium">{cambio.miembro.nombre}</span>
                  {cambio.miembro.id === null && <span className="text-texto-2"> (ya no está en el equipo)</span>}{" "}
                  {sobreQue(cambio)}:{" "}
                  <span className="tabular-nums">
                    {formatearPorcentaje(cambio.antes)} → {formatearPorcentaje(cambio.despues)}
                  </span>
                </p>
                <p className="mt-0.5 text-texto-2">{cuandoParaLeer(cambio.cuando)}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
      {historial && (
        <Paginador
          nombre="Páginas del historial de comisiones"
          pagina={historial.pagina}
          paginas={historial.paginas}
          actualizando={cargando}
          onPagina={cambiarPagina}
        />
      )}
    </section>
  )
}
