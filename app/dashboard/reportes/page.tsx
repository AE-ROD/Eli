"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { AnimatePresence } from "framer-motion"
import { RefreshCw } from "lucide-react"
import { BarraSuperior } from "@/components/panel/barra-superior"
import { Boton } from "@/components/comunes/boton"
import { Esqueleto } from "@/components/comunes/esqueleto"
import { ModalAnular } from "@/components/panel/modal-anular"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { comoTexto, formatearHora } from "@/lib/fechas"
import { rangoDePeriodo, rangoPersonalizado, type RangoDePeriodo } from "@/lib/periodos"
import { actorDeSesion, puedeAnular, puedeVerAnuladas } from "@/lib/permisos"
import type { Resultado } from "@/lib/peticiones"
import { rotuloDeIngresos } from "@/lib/reportes"
import { cn } from "@/lib/utils"
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
import { Aviso } from "@/components/panel/aviso"
import { FiltrosDeReporte, type FiltrosElegidos } from "./_componentes/filtros-de-reporte"
import { ResumenDeReporte } from "./_componentes/resumen-de-reporte"
import { HistorialDeCobros, diaCorto } from "./_componentes/historial-de-cobros"
import { HistorialDeAnuladas, ResumenDeAnuladas } from "./_componentes/historial-de-anuladas"
import { SelectorDeVista, idDePestaña, type VistaDeReporte } from "./_componentes/selector-de-vista"
import { LlenarHoras } from "./_componentes/llenar-horas"

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

/** Las vistas que usan los filtros y el pedido de esta página. "Llenar horas" trae los suyos. */
type VistaDeCobros = Exclude<VistaDeReporte, "llenar-horas">

/** Mientras llega el primer reporte: las cifras y el historial en gris, con su forma, sin números inventados. */
function ReporteCargando() {
  return (
    <div role="status" className="space-y-4">
      <span className="sr-only">Cargando el reporte…</span>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
        {[0, 1, 2].map((cifra) => (
          <div
            key={cifra}
            className={cn(TARJETA_DEL_PANEL, "space-y-4 p-5 sm:p-6", cifra === 0 && "sm:col-span-2 xl:col-span-1")}
          >
            <Esqueleto className="w-1/3" />
            <Esqueleto className="h-7 w-1/2" />
          </div>
        ))}
      </div>
      <div className={cn(TARJETA_DEL_PANEL, "space-y-4 p-5 sm:p-6")} aria-hidden="true">
        <Esqueleto className="h-5 w-1/4" />
        {[0, 1, 2, 3].map((fila) => (
          <Esqueleto key={fila} />
        ))}
      </div>
    </div>
  )
}

function AvisoDeTruncado() {
  return (
    <Aviso tono="atencion" rol="status">
      El período tiene demasiadas atenciones para sumarlas de una vez: las cifras y el historial están incompletos.
      Acota el período para verlo entero.
    </Aviso>
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
  const vistaVisible: VistaDeReporte = verAnuladas ? vistaElegida : "cobradas"
  const llenarHoras = vistaVisible === "llenar-horas"
  // Lo que piden los filtros y el historial: en "Llenar horas" queda lo último de lo cobrado, sin pedir.
  const vista: VistaDeCobros = vistaVisible === "llenar-horas" ? "cobradas" : vistaVisible

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
    // "Llenar horas" pide lo suyo.
    if (llenarHoras) return
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
  }, [consulta, filtros, pagina, vista, llenarHoras])

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

  const subtitulo = llenarHoras
    ? "Ocupación del equipo, clientes nuevos y quién no vino"
    : !reporte
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
  /** Se ve lo anterior mientras llega lo nuevo: los filtros lo dicen ("Actualizando…"). */
  const actualizandoLoQueSeVe = cargando && (mostrarReporte || mostrarAnuladas)

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

      <div className="space-y-6 px-4 pb-8 pt-4 sm:px-6 sm:pt-6">
        {verAnuladas && (
          <SelectorDeVista idBase={idBase} idDelPanel={idDelPanel} vista={vistaVisible} onCambiar={cambiarVista} />
        )}

        <div
          id={idDelPanel}
          role={verAnuladas ? "tabpanel" : undefined}
          aria-labelledby={verAnuladas ? idDePestaña(idBase, vistaVisible) : undefined}
          className="space-y-6"
        >
          {llenarHoras && <LlenarHoras />}
          {!llenarHoras && (
            <>
              <FiltrosDeReporte
                filtros={filtros}
                opciones={opciones}
                errorDeOpciones={errorDeOpciones}
                alcance={reporte?.alcance ?? null}
                errorDeRango={errorDeRango}
                soloPeriodo={vista === "anuladas"}
                actualizando={actualizandoLoQueSeVe}
                onCambiar={cambiarFiltros}
                onReintentarOpciones={reintentarOpciones}
              />

              {errorDelReporte && (
                <Aviso
                  tono="error"
                  rol="alert"
                  accion={
                    <Boton variante="secundario" tamano="sm" onClick={() => setReintentos((previos) => previos + 1)}>
                      <RefreshCw aria-hidden="true" className="size-4" strokeWidth={2} />
                      Reintentar
                    </Boton>
                  }
                >
                  {errorDelReporte}
                </Aviso>
              )}

              {mensaje && (
                <Aviso tono={mensaje.error ? "error" : "listo"} rol={mensaje.error ? "alert" : "status"}>
                  {mensaje.texto}
                </Aviso>
              )}

              {((vista === "cobradas" && !reporte) || (vista === "anuladas" && !anuladas)) && cargando && <ReporteCargando />}

              {mostrarReporte && (
                <div aria-busy={cargando} className="space-y-6">
                  {reporte.truncado && !cargando && <AvisoDeTruncado />}
                  <div className={cn("transition-opacity duration-200 ease-suave", cargando && "opacity-60")}>
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
                  <div className={cn("transition-opacity duration-200 ease-suave", cargando && "opacity-60")}>
                    <ResumenDeAnuladas reporte={anuladas} />
                  </div>
                  <HistorialDeAnuladas reporte={anuladas} actualizando={cargando} onPagina={setPagina} />
                </div>
              )}
            </>
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
