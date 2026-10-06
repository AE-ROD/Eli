"use client"

import { useEffect, useState } from "react"
import { RefreshCw, TriangleAlert } from "lucide-react"
import { BarraSuperior } from "@/components/panel/barra-superior"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { ANILLO_DE_FOCO } from "@/components/panel/estilos"
import { comoTexto } from "@/lib/fechas"
import { rangoDePeriodo, rangoPersonalizado, type RangoDePeriodo } from "@/lib/periodos"
import type { Resultado } from "@/lib/peticiones"
import { leerOpcionesDeFiltro, leerReporte, type OpcionesDeFiltro, type Reporte } from "./_datos"
import { FiltrosDeReporte, type FiltrosElegidos } from "./_componentes/filtros-de-reporte"
import { ResumenDeReporte } from "./_componentes/resumen-de-reporte"
import { HistorialDeCobros } from "./_componentes/historial-de-cobros"

const FILTROS_INICIALES: FiltrosElegidos = {
  periodo: "hoy",
  desde: "",
  hasta: "",
  turno: "",
  profesional: "",
  servicio: "",
  medio: "",
}

/** El rango del período elegido. Los fijos se calculan con el reloj del momento en que se piden. */
function rangoElegido(filtros: FiltrosElegidos): RangoDePeriodo {
  if (filtros.periodo === "personalizado") return rangoPersonalizado(filtros.desde, filtros.hasta)
  return { ok: true, ...rangoDePeriodo(filtros.periodo, new Date()) }
}

function ReporteCargando() {
  return (
    <div role="status" className="space-y-4">
      <span className="sr-only">Cargando el reporte…</span>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" aria-hidden="true">
        {[0, 1, 2].map((cifra) => (
          <div key={cifra} className="bg-card border border-border/50 rounded-xl p-5 animate-pulse space-y-2">
            <div className="h-3.5 w-1/2 rounded bg-muted" />
            <div className="h-7 w-2/3 rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="bg-card border border-border/50 rounded-xl p-5 animate-pulse space-y-3" aria-hidden="true">
        {[0, 1, 2, 3].map((fila) => (
          <div key={fila} className="h-4 w-full rounded bg-muted" />
        ))}
      </div>
    </div>
  )
}

export default function PaginaReportes() {
  const [filtros, setFiltros] = useState<FiltrosElegidos>(FILTROS_INICIALES)
  const [pagina, setPagina] = useState(1)
  const [reintentos, setReintentos] = useState(0)

  /** La última respuesta, con la consulta que la pidió: así se sabe si es la de lo que se ve elegido. */
  const [respuesta, setRespuesta] = useState<{ consulta: string; resultado: Resultado<Reporte> } | null>(null)
  /** El último reporte que llegó bien: se sigue mostrando mientras carga el siguiente. */
  const [reporte, setReporte] = useState<Reporte | null>(null)

  const [opciones, setOpciones] = useState<OpcionesDeFiltro | null>(null)
  const [errorDeOpciones, setErrorDeOpciones] = useState("")

  useEffect(() => {
    leerOpcionesDeFiltro().then((resultado) => {
      if (resultado.ok) setOpciones(resultado.datos)
      else setErrorDeOpciones(resultado.error)
    })
  }, [])

  // Todo lo que define el pedido, en un texto: cuando cambia, se pide de nuevo.
  const consulta = JSON.stringify({ filtros, pagina, reintentos })
  const rangoPropio = filtros.periodo === "personalizado" ? rangoPersonalizado(filtros.desde, filtros.hasta) : null
  const errorDeRango = rangoPropio && !rangoPropio.ok ? rangoPropio.error : ""

  useEffect(() => {
    const rango = rangoElegido(filtros)
    // Un rango que no sirve no se pide: el error ya se ve junto a las fechas.
    if (!rango.ok) return

    let vigente = true
    leerReporte({ ...filtros, desde: rango.desde, hasta: rango.hasta, pagina }).then((resultado) => {
      // Si entretanto se eligió otra cosa, esta respuesta ya no es la que se mira.
      if (!vigente) return
      setRespuesta({ consulta, resultado })
      if (resultado.ok) setReporte(resultado.datos)
    })
    return () => {
      vigente = false
    }
  }, [consulta, filtros, pagina])

  const cargando = !errorDeRango && respuesta?.consulta !== consulta
  const errorDelReporte = !cargando && respuesta && !respuesta.resultado.ok ? respuesta.resultado.error : ""

  /** Cualquier filtro nuevo vuelve a la primera página: la que se miraba puede no existir con los filtros nuevos. */
  const cambiarFiltros = (cambios: Partial<FiltrosElegidos>) => {
    const hoy = comoTexto(new Date())
    setFiltros((previos) => {
      const siguientes = { ...previos, ...cambios }
      // Al pasar a personalizado sin fechas, arranca en hoy: hay algo que mirar
      // de entrada y sólo se ajusta lo que haga falta.
      if (cambios.periodo === "personalizado" && !previos.desde && !previos.hasta) {
        siguientes.desde = hoy
        siguientes.hasta = hoy
      }
      return siguientes
    })
    setPagina(1)
  }

  const subtitulo = !reporte
    ? errorDelReporte
      ? undefined
      : "Cargando..."
    : reporte.alcance === "propio"
      ? "Lo que atendiste"
      : "Lo atendido y cobrado en el tablero"

  // Con un rango que no sirve o un pedido que falló, el último reporte ya no
  // es el de lo elegido: no se muestra como si lo fuera.
  const mostrarReporte = reporte !== null && !errorDeRango && !errorDelReporte

  return (
    <div className="min-h-screen">
      <BarraSuperior titulo="Reportes" subtitulo={subtitulo} />

      <div className="p-4 sm:p-6 space-y-6">
        <FiltrosDeReporte
          filtros={filtros}
          opciones={opciones}
          errorDeOpciones={errorDeOpciones}
          alcance={reporte?.alcance ?? null}
          errorDeRango={errorDeRango}
          onCambiar={cambiarFiltros}
        />

        {errorDelReporte && (
          <div className="flex flex-wrap items-center gap-3">
            <p role="alert" className="text-sm text-red-500">
              {errorDelReporte}
            </p>
            <BotonPrimario
              variante="secundario"
              tamaño="sm"
              onClick={() => setReintentos((previos) => previos + 1)}
              icono={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
              className={ANILLO_DE_FOCO}
            >
              Reintentar
            </BotonPrimario>
          </div>
        )}

        {mostrarReporte && reporte.truncado && !cargando && (
          <p role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            El período tiene demasiadas atenciones para sumarlas de una vez: las cifras y el historial están incompletos.
            Acota el período para verlo entero.
          </p>
        )}

        {!reporte && cargando && <ReporteCargando />}

        {mostrarReporte && (
          <div aria-busy={cargando} className="space-y-6">
            {cargando && (
              <p role="status" className="text-sm text-muted-foreground">
                Actualizando…
              </p>
            )}
            <div className={cargando ? "opacity-60 transition-opacity" : "transition-opacity"}>
              <ResumenDeReporte reporte={reporte} />
            </div>
            <HistorialDeCobros reporte={reporte} actualizando={cargando} onPagina={setPagina} />
          </div>
        )}
      </div>
    </div>
  )
}
