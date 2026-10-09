"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { AnimatePresence } from "framer-motion"
import { RefreshCw, TriangleAlert } from "lucide-react"
import { BarraSuperior } from "@/components/panel/barra-superior"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { ModalAnular } from "@/components/panel/modal-anular"
import { ANILLO_DE_FOCO } from "@/components/panel/estilos"
import { comoTexto, formatearHora } from "@/lib/fechas"
import { rangoDePeriodo, rangoPersonalizado, type RangoDePeriodo } from "@/lib/periodos"
import { actorDeSesion, puedeAnular, puedeVerAnuladas } from "@/lib/permisos"
import type { Resultado } from "@/lib/peticiones"
import { rotuloDeIngresos } from "@/lib/reportes"
import {
  anularCobro,
  leerAnuladas,
  leerOpcionesDeFiltro,
  leerReporte,
  type FilaDeReporte,
  type OpcionesDeFiltro,
  type Reporte,
  type ReporteDeAnuladas,
} from "./_datos"
import { FiltrosDeReporte, type FiltrosElegidos } from "./_componentes/filtros-de-reporte"
import { ResumenDeReporte } from "./_componentes/resumen-de-reporte"
import { HistorialDeCobros, diaCorto } from "./_componentes/historial-de-cobros"
import { HistorialDeAnuladas, ResumenDeAnuladas } from "./_componentes/historial-de-anuladas"
import { SelectorDeVista, idDePestaña, type VistaDeReporte } from "./_componentes/selector-de-vista"

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

/** La última respuesta, con la consulta que la pidió: así se sabe si es la de lo que se ve elegido. */
type Respuesta =
  | { vista: "cobradas"; consulta: string; resultado: Resultado<Reporte> }
  | { vista: "anuladas"; consulta: string; resultado: Resultado<ReporteDeAnuladas> }

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

function AvisoDeTruncado() {
  return (
    <p role="status" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
      El período tiene demasiadas atenciones para sumarlas de una vez: las cifras y el historial están incompletos.
      Acota el período para verlo entero.
    </p>
  )
}

export default function PaginaReportes() {
  const { data: sesion } = useSession()
  const actor = actorDeSesion(sesion)
  const verAnuladas = puedeVerAnuladas(actor)
  // Lo cobrado lo anula sólo el dueño (`puedeAnular`). Todas las filas son del
  // negocio de quien mira: el endpoint filtra por su negocio.
  const anulaCobros = actor !== null && puedeAnular(actor, { businessId: actor.businessId, status: "finalizada" })

  const idBase = useId()
  const idDelPanel = `${idBase}-panel`
  const [vistaElegida, setVistaElegida] = useState<VistaDeReporte>("cobradas")
  // Sin permiso para ver lo anulado no hay pestañas: siempre lo cobrado.
  const vista: VistaDeReporte = verAnuladas ? vistaElegida : "cobradas"

  const [filtros, setFiltros] = useState<FiltrosElegidos>(FILTROS_INICIALES)
  const [pagina, setPagina] = useState(1)
  const [reintentos, setReintentos] = useState(0)

  const [respuesta, setRespuesta] = useState<Respuesta | null>(null)
  /** Lo último que llegó bien de cada vista: se sigue mostrando mientras carga lo siguiente. */
  const [reporte, setReporte] = useState<Reporte | null>(null)
  const [anuladas, setAnuladas] = useState<ReporteDeAnuladas | null>(null)

  const [opciones, setOpciones] = useState<OpcionesDeFiltro | null>(null)
  const [errorDeOpciones, setErrorDeOpciones] = useState("")
  const [pedidoDeOpciones, setPedidoDeOpciones] = useState(0)

  // Anular un cobro del historial (sólo el dueño).
  const [anulando, setAnulando] = useState<FilaDeReporte | null>(null)
  const [avisoDeAnular, setAvisoDeAnular] = useState("")
  const [guardandoAnulacion, setGuardandoAnulacion] = useState(false)
  /** Un ref y no sólo el estado: un doble clic llega antes de que se dibuje el botón ocupado. */
  const anulacionEnviada = useRef(false)
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null)
  const [enfocarHistorial, setEnfocarHistorial] = useState(false)

  useEffect(() => {
    let vigente = true
    leerOpcionesDeFiltro().then((resultado) => {
      if (!vigente) return
      if (resultado.ok) setOpciones(resultado.datos)
      else setErrorDeOpciones(resultado.error)
    })
    return () => {
      vigente = false
    }
  }, [pedidoDeOpciones])

  const reintentarOpciones = () => {
    setErrorDeOpciones("")
    setPedidoDeOpciones((previo) => previo + 1)
  }

  // Todo lo que define el pedido, en un texto: cuando cambia, se pide de nuevo.
  const consulta = JSON.stringify({ vista, filtros, pagina, reintentos })
  const rangoPropio = filtros.periodo === "personalizado" ? rangoPersonalizado(filtros.desde, filtros.hasta) : null
  const errorDeRango = rangoPropio && !rangoPropio.ok ? rangoPropio.error : ""

  useEffect(() => {
    const rango = rangoElegido(filtros)
    // Un rango que no sirve no se pide: el error ya se ve junto a las fechas.
    if (!rango.ok) return

    let vigente = true
    if (vista === "anuladas") {
      leerAnuladas({ desde: rango.desde, hasta: rango.hasta, pagina }).then((resultado) => {
        if (!vigente) return
        setRespuesta({ vista, consulta, resultado })
        if (resultado.ok) setAnuladas(resultado.datos)
      })
    } else {
      leerReporte({ ...filtros, desde: rango.desde, hasta: rango.hasta, pagina }).then((resultado) => {
        // Si entretanto se eligió otra cosa, esta respuesta ya no es la que se mira.
        if (!vigente) return
        setRespuesta({ vista, consulta, resultado })
        if (resultado.ok) setReporte(resultado.datos)
      })
    }
    return () => {
      vigente = false
    }
  }, [consulta, filtros, pagina, vista])

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
    setMensaje(null)
  }

  const cambiarVista = (otra: VistaDeReporte) => {
    if (otra === vistaElegida) return
    setVistaElegida(otra)
    setPagina(1)
    setMensaje(null)
  }

  // ─── Anular un cobro ──────────────────────────────────────────────────────

  const abrirAnular = (fila: FilaDeReporte) => {
    setMensaje(null)
    setAvisoDeAnular("")
    setGuardandoAnulacion(false)
    setAnulando(fila)
  }

  const cerrarAnular = () => {
    setAnulando(null)
    setAvisoDeAnular("")
    setGuardandoAnulacion(false)
  }

  const anular = async (fila: FilaDeReporte, motivo: string) => {
    if (anulacionEnviada.current) return
    anulacionEnviada.current = true
    setGuardandoAnulacion(true)
    setAvisoDeAnular("")
    const resultado = await anularCobro(fila.id, motivo)
    anulacionEnviada.current = false

    const cuando = `${diaCorto(fila.cobradaEn)}, ${formatearHora(fila.cobradaEn)}`
    if (resultado.ok) {
      cerrarAnular()
      setMensaje({
        texto: `Se anuló el cobro de ${fila.cliente.nombre} (${cuando}): ya no suma a los ingresos. Queda en Anuladas, con la fecha de hoy.`,
        error: false,
      })
      // La fila del botón se va con la recarga: el foco, al título del historial.
      setEnfocarHistorial(true)
      setReintentos((previos) => previos + 1)
      return
    }

    // 404 o 409: el cobro cambió entretanto (otro ya lo anuló). Lo que se ve
    // está viejo: se cierra, se dice y se recarga.
    if (resultado.codigo === 404 || resultado.codigo === 409) {
      cerrarAnular()
      setMensaje({ texto: `${resultado.error.replace(/\.$/, "")}. Se recargó el reporte.`, error: true })
      setEnfocarHistorial(true)
      setReintentos((previos) => previos + 1)
      return
    }

    setGuardandoAnulacion(false)
    setAvisoDeAnular(resultado.error)
  }

  const historialEnfocado = useCallback(() => setEnfocarHistorial(false), [])

  // ─── Pantalla ─────────────────────────────────────────────────────────────

  const subtitulo = !reporte
    ? errorDelReporte
      ? undefined
      : "Cargando..."
    : reporte.alcance === "propio"
      ? "Lo que atendiste"
      : "Lo atendido y cobrado en el tablero"

  // Con un rango que no sirve o un pedido que falló, lo último que llegó ya
  // no es lo de lo elegido: no se muestra como si lo fuera.
  const mostrarReporte = vista === "cobradas" && reporte !== null && !errorDeRango && !errorDelReporte
  const mostrarAnuladas = vista === "anuladas" && anuladas !== null && !errorDeRango && !errorDelReporte

  /** Los nombres de lo elegido en los filtros, para titular la cifra principal. */
  const nombreDe = (lista: { id: string; nombre: string }[] | undefined, id: string, siNoEsta: string) =>
    id ? (lista?.find((opcion) => opcion.id === id)?.nombre ?? siNoEsta) : ""
  const rotulo = reporte
    ? rotuloDeIngresos(reporte.alcance === "propio", {
        profesional: nombreDe(opciones?.profesionales, filtros.profesional, "el profesional elegido"),
        servicio: nombreDe(opciones?.servicios, filtros.servicio, "el servicio elegido"),
        medio: filtros.medio,
      })
    : ""

  return (
    <div className="min-h-screen">
      <BarraSuperior titulo="Reportes" subtitulo={subtitulo} />

      <div className="p-4 sm:p-6 space-y-6">
        {verAnuladas && (
          <SelectorDeVista idBase={idBase} idDelPanel={idDelPanel} vista={vista} onCambiar={cambiarVista} />
        )}

        <div
          id={idDelPanel}
          role={verAnuladas ? "tabpanel" : undefined}
          aria-labelledby={verAnuladas ? idDePestaña(idBase, vista) : undefined}
          className="space-y-6"
        >
          <FiltrosDeReporte
            filtros={filtros}
            opciones={opciones}
            errorDeOpciones={errorDeOpciones}
            alcance={reporte?.alcance ?? null}
            errorDeRango={errorDeRango}
            soloPeriodo={vista === "anuladas"}
            onCambiar={cambiarFiltros}
            onReintentarOpciones={reintentarOpciones}
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

          {mensaje && (
            <p role={mensaje.error ? "alert" : "status"} className={mensaje.error ? "text-sm text-red-500" : "text-sm text-green-700"}>
              {mensaje.texto}
            </p>
          )}

          {((vista === "cobradas" && !reporte) || (vista === "anuladas" && !anuladas)) && cargando && <ReporteCargando />}

          {mostrarReporte && (
            <div aria-busy={cargando} className="space-y-6">
              {reporte.truncado && !cargando && <AvisoDeTruncado />}
              {cargando && (
                <p role="status" className="text-sm text-muted-foreground">
                  Actualizando…
                </p>
              )}
              <div className={cargando ? "opacity-60 transition-opacity" : "transition-opacity"}>
                <ResumenDeReporte reporte={reporte} rotuloDeIngresos={rotulo} />
              </div>
              <HistorialDeCobros
                reporte={reporte}
                actualizando={cargando}
                onPagina={setPagina}
                resaltarCoincidencias={filtros.profesional !== "" || filtros.servicio !== ""}
                onAnular={anulaCobros ? abrirAnular : undefined}
                enfocarTitulo={enfocarHistorial}
                onTituloEnfocado={historialEnfocado}
              />
            </div>
          )}

          {mostrarAnuladas && (
            <div aria-busy={cargando} className="space-y-6">
              {anuladas.truncado && !cargando && <AvisoDeTruncado />}
              {cargando && (
                <p role="status" className="text-sm text-muted-foreground">
                  Actualizando…
                </p>
              )}
              <div className={cargando ? "opacity-60 transition-opacity" : "transition-opacity"}>
                <ResumenDeAnuladas reporte={anuladas} />
              </div>
              <HistorialDeAnuladas reporte={anuladas} actualizando={cargando} onPagina={setPagina} />
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {anulando && (
          <ModalAnular
            key={`anular-${anulando.id}`}
            atencion={{
              estado: "finalizada",
              cliente: anulando.cliente,
              total: anulando.total,
              cobradaEn: anulando.cobradaEn,
            }}
            aviso={avisoDeAnular}
            guardando={guardandoAnulacion}
            onAnular={(motivo) => anular(anulando, motivo)}
            onCerrar={cerrarAnular}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
