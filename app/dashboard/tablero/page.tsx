"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { AnimatePresence } from "framer-motion"
import { RefreshCw, UserPlus } from "lucide-react"
import { BarraSuperior } from "@/components/panel/barra-superior"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { ANILLO_DE_FOCO } from "@/components/panel/estilos"
import type { EstadoActivo, PagoPedido } from "@/lib/atenciones"
import { requisitoParaPasarA, textoDeMovimiento, type LineaPedida } from "@/lib/acciones-del-tablero"
import {
  actorDeSesion,
  puedeAnotarSinReserva,
  puedeAsignarLineasAOtros,
  puedeGestionarServicios,
  puedeVerTodoElTablero,
} from "@/lib/permisos"
import {
  anotarSinReserva,
  anularAtencion,
  cobrarAtencion,
  guardarServicios,
  leerTablero,
  marcarLlegada,
  moverAtencion,
  type Atencion,
  type DatosSinReserva,
  type MotivoDeFallo,
  type Reserva,
  type Tablero,
} from "./_datos"
import { TableroCargando, TableroDeColumnas } from "./_componentes/tablero-de-columnas"
import { ModalAnotarSinReserva } from "./_componentes/modal-anotar-sin-reserva"
import { ModalServicios } from "./_componentes/modal-servicios"
import { ModalCobro } from "./_componentes/modal-cobro"
import { ModalAnular } from "./_componentes/modal-anular"

/** Cada cuánto se recarga solo: lo que hacen los demás en el local aparece sin tocar nada. */
const RECARGA_CADA_MS = 30_000

/** Al volver a la pestaña llegan `focus` y `visibilitychange` casi juntos: con una recarga alcanza. */
const PAUSA_ENTRE_RECARGAS_MS = 2_000

/** El aviso cuando lo que se veía quedó viejo (409 o 404): la ficha lo fija con estas palabras. */
const AVISO_DE_CAMBIO = "La atención cambió; se recargó el tablero."

/** Lo que se hace después de guardar los servicios, si el editor se abrió porque faltaba algo para avanzar. */
type Despues = { tipo: "mover"; hacia: EstadoActivo } | { tipo: "cobrar" }

type ModalAbierto =
  | { tipo: "anotar" }
  | { tipo: "servicios"; atencion: Atencion; requisito: string | null; despues: Despues | null }
  | { tipo: "cobro"; atencion: Atencion }
  | { tipo: "anular"; atencion: Atencion }

type ModalDeServicios = Extract<ModalAbierto, { tipo: "servicios" }>

/** `Martes, 6 de octubre`, con mayúscula inicial. */
function fechaLarga(instante: number): string {
  const fecha = new Date(instante).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })
  return fecha.charAt(0).toUpperCase() + fecha.slice(1)
}

/** "Guardar", o "Guardar y …" con lo que se va a hacer después. */
function textoParaGuardar(atencion: Atencion, despues: Despues | null): string {
  if (!despues) return "Guardar"
  if (despues.tipo === "cobrar") return "Guardar y cobrar"
  const accion = textoDeMovimiento(atencion.estado, despues.hacia)
  return `Guardar y ${accion.charAt(0).toLowerCase()}${accion.slice(1)}`
}

/** El mensaje del servidor sobre una reserva que cambió, seguido de que se recargó. */
const conRecarga = (mensaje: string) => `${mensaje.replace(/\.$/, "")}. Se recargó el tablero.`

export default function PaginaTablero() {
  const { data: sesion, status: estadoDeSesion } = useSession()
  const actor = actorDeSesion(sesion)

  const [tablero, setTablero] = useState<Tablero | null>(null)
  const [errorDeCarga, setErrorDeCarga] = useState("")
  /** El instante de la última recarga: contra él se mide lo atrasado y el "hace cuánto". */
  const [ahora, setAhora] = useState(0)
  const [aviso, setAviso] = useState("")
  const [enCurso, setEnCurso] = useState<ReadonlySet<string>>(() => new Set())

  const [modal, setModal] = useState<ModalAbierto | null>(null)
  const [avisoDelModal, setAvisoDelModal] = useState("")
  const [guardando, setGuardando] = useState(false)

  // El número del último pedido de recarga: si llega la respuesta de uno
  // anterior (más lento), se descarta en vez de pisar datos más nuevos.
  const ultimoPedido = useRef(0)
  const inicioDeLaUltimaRecarga = useRef(0)

  const recargar = useCallback(async () => {
    const numero = ++ultimoPedido.current
    inicioDeLaUltimaRecarga.current = Date.now()
    // El día se calcula en cada recarga: si la pestaña sigue abierta pasada
    // la medianoche, la siguiente recarga ya trae el día nuevo.
    const resultado = await leerTablero(new Date())
    if (numero !== ultimoPedido.current) return

    setAhora(Date.now())
    if (resultado.ok) {
      setTablero(resultado.datos)
      setErrorDeCarga("")
    } else {
      setErrorDeCarga(resultado.error)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- primera carga del tablero; el estado se escribe recién cuando llega la respuesta
    recargar()

    // Con la pestaña escondida no se recarga: al volver se recarga una vez.
    const intervalo = setInterval(() => {
      if (document.visibilityState === "visible") recargar()
    }, RECARGA_CADA_MS)

    const alVolver = () => {
      if (document.visibilityState !== "visible") return
      if (Date.now() - inicioDeLaUltimaRecarga.current < PAUSA_ENTRE_RECARGAS_MS) return
      recargar()
    }
    document.addEventListener("visibilitychange", alVolver)
    window.addEventListener("focus", alVolver)

    return () => {
      clearInterval(intervalo)
      document.removeEventListener("visibilitychange", alVolver)
      window.removeEventListener("focus", alVolver)
    }
  }, [recargar])

  // ─── Cambios locales, mientras llega la recarga ───────────────────────────

  const marcarEnCurso = (id: string, activo: boolean) =>
    setEnCurso((previos) => {
      const siguientes = new Set(previos)
      if (activo) siguientes.add(id)
      else siguientes.delete(id)
      return siguientes
    })

  /** La atención como la devolvió el servidor: reemplaza a la que se veía, o se suma si es nueva. */
  const ponerAtencion = (atencion: Atencion) =>
    setTablero(
      (previo) =>
        previo && {
          ...previo,
          atenciones: previo.atenciones.some((otra) => otra.id === atencion.id)
            ? previo.atenciones.map((otra) => (otra.id === atencion.id ? atencion : otra))
            : [...previo.atenciones, atencion],
        }
    )

  const cerrarModal = () => {
    setModal(null)
    setAvisoDelModal("")
    setGuardando(false)
  }

  const abrirModal = (abierto: ModalAbierto) => {
    setAviso("")
    setAvisoDelModal("")
    setGuardando(false)
    setModal(abierto)
  }

  /** Lo que se veía quedó viejo: se cierra lo abierto, se avisa y se recarga. */
  const tableroDesactualizado = (mensaje = AVISO_DE_CAMBIO) => {
    cerrarModal()
    setAviso(mensaje)
    recargar()
  }

  /** Un fallo dentro de un modal: si el tablero quedó viejo se recarga; si no, se avisa adentro. */
  const falloEnModal = (fallo: { error: string; motivo: MotivoDeFallo }) => {
    setGuardando(false)
    if (fallo.motivo === "desactualizada") return tableroDesactualizado()
    setAvisoDelModal(fallo.error)
  }

  // ─── Acciones de las tarjetas ─────────────────────────────────────────────

  const llego = async (reserva: Reserva) => {
    setAviso("")
    marcarEnCurso(reserva.id, true)
    const resultado = await marcarLlegada(reserva.id)
    marcarEnCurso(reserva.id, false)

    if (!resultado.ok) {
      // Otro ya la marcó, o la cancelaron: el mensaje del servidor dice cuál.
      if (resultado.motivo === "desactualizada") return tableroDesactualizado(conRecarga(resultado.error))
      return setAviso(resultado.error)
    }

    const atencion = resultado.datos
    setTablero(
      (previo) =>
        previo && {
          ...previo,
          reservas: previo.reservas.filter((otra) => otra.id !== reserva.id),
          atenciones: [...previo.atenciones, atencion],
        }
    )
    recargar()
  }

  const editarServicios = (atencion: Atencion, despues: Despues | null = null, requisito: string | null = null) =>
    abrirModal({ tipo: "servicios", atencion, despues, requisito })

  /**
   * Mover a otra columna. Si se sabe que falta algo, no se le pregunta al
   * servidor para recibir un 400: se abre el editor de servicios, y al
   * guardar se sigue con el movimiento.
   */
  const mover = async (atencion: Atencion, hacia: EstadoActivo) => {
    setAviso("")
    const falta = requisitoParaPasarA(atencion.lineas, hacia)
    if (falta) return editarServicios(atencion, { tipo: "mover", hacia }, falta)

    marcarEnCurso(atencion.id, true)
    const resultado = await moverAtencion(atencion.id, hacia)
    marcarEnCurso(atencion.id, false)

    if (!resultado.ok) {
      if (resultado.motivo === "desactualizada") return tableroDesactualizado()
      // El profesional ve sólo sus líneas: lo que falta puede estar en las de
      // otro, y eso lo sabe el servidor. Se abre el editor con su mensaje.
      if (resultado.motivo === "falta-requisito") {
        return editarServicios(atencion, { tipo: "mover", hacia }, resultado.error)
      }
      return setAviso(resultado.error)
    }

    ponerAtencion(resultado.datos)
    recargar()
  }

  /** Cobrar. Si a alguna línea le falta quién la hizo, primero el editor; si no, el cobro. */
  const cobrar = (atencion: Atencion) => {
    const falta = requisitoParaPasarA(atencion.lineas, "finalizada")
    if (falta) return editarServicios(atencion, { tipo: "cobrar" }, falta)
    abrirModal({ tipo: "cobro", atencion })
  }

  // ─── Lo que confirman los modales ─────────────────────────────────────────

  const guardarServiciosDe = async (abierto: ModalDeServicios, lineas: LineaPedida[]) => {
    setGuardando(true)
    setAvisoDelModal("")
    const guardado = await guardarServicios(abierto.atencion.id, lineas)
    if (!guardado.ok) return falloEnModal(guardado)

    const atencion = guardado.datos
    ponerAtencion(atencion)

    const { despues } = abierto
    if (!despues) {
      cerrarModal()
      recargar()
      return
    }

    // Se guardó, pero si todavía no alcanza para avanzar, el editor sigue
    // abierto diciendo qué falta.
    const falta = requisitoParaPasarA(atencion.lineas, despues.tipo === "cobrar" ? "finalizada" : despues.hacia)
    if (falta) {
      setGuardando(false)
      setModal({ ...abierto, atencion, requisito: falta })
      return
    }

    if (despues.tipo === "cobrar") {
      abrirModal({ tipo: "cobro", atencion })
      return
    }

    const movida = await moverAtencion(atencion.id, despues.hacia)
    if (!movida.ok) {
      // Los servicios ya quedaron guardados: el editor sigue abierto con lo
      // que dijo el servidor, y se puede volver a intentar.
      if (movida.motivo === "falta-requisito") {
        setGuardando(false)
        setModal({ ...abierto, atencion, requisito: movida.error })
        return
      }
      setModal({ ...abierto, atencion })
      return falloEnModal(movida)
    }
    ponerAtencion(movida.datos)
    cerrarModal()
    recargar()
  }

  const cobrarCon = async (atencion: Atencion, pagos: PagoPedido[]) => {
    setGuardando(true)
    setAvisoDelModal("")
    const resultado = await cobrarAtencion(atencion.id, pagos)
    if (!resultado.ok) return falloEnModal(resultado)

    ponerAtencion(resultado.datos)
    cerrarModal()
    recargar()
  }

  const anular = async (atencion: Atencion, motivo: string) => {
    setGuardando(true)
    setAvisoDelModal("")
    const resultado = await anularAtencion(atencion.id, motivo)
    if (!resultado.ok) return falloEnModal(resultado)

    // Las anuladas no tienen columna: sale del tablero.
    setTablero((previo) => previo && { ...previo, atenciones: previo.atenciones.filter((otra) => otra.id !== atencion.id) })
    cerrarModal()
    recargar()
  }

  const anotar = async (datos: DatosSinReserva) => {
    setGuardando(true)
    setAvisoDelModal("")
    const resultado = await anotarSinReserva(datos)
    // Acá un 404 es un cliente que ya no existe, no un tablero viejo: se avisa
    // adentro y el modal queda abierto con lo que se cargó.
    if (!resultado.ok) {
      setGuardando(false)
      setAvisoDelModal(resultado.error)
      return
    }

    ponerAtencion(resultado.datos)
    cerrarModal()
    recargar()
  }

  // ─── Pantalla ─────────────────────────────────────────────────────────────

  const listo = tablero !== null && estadoDeSesion !== "loading"
  const puedeAnotar = listo && puedeAnotarSinReserva(actor)
  const abrirAnotar = () => abrirModal({ tipo: "anotar" })

  return (
    <div className="min-h-screen">
      <BarraSuperior
        titulo="Tablero"
        subtitulo={ahora ? fechaLarga(ahora) : "Cargando..."}
        accionPrincipal={puedeAnotar ? { texto: "Anotar sin reserva", onClick: abrirAnotar } : undefined}
      />

      <div className="p-4 sm:p-6 space-y-4">
        {/* La acción de la barra de arriba no se ve en el teléfono: acá sí. */}
        {puedeAnotar && (
          <BotonPrimario
            anchoCompleto
            onClick={abrirAnotar}
            icono={<UserPlus className="h-4 w-4" aria-hidden="true" />}
            className={`sm:hidden ${ANILLO_DE_FOCO}`}
          >
            Anotar sin reserva
          </BotonPrimario>
        )}

        {aviso && (
          <p role="alert" className="text-sm text-red-500">
            {aviso}
          </p>
        )}

        {tablero && errorDeCarga && (
          <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-red-500">
            <span>No se pudo actualizar el tablero: {errorDeCarga}. Se vuelve a intentar solo.</span>
            <button
              type="button"
              onClick={recargar}
              className={`inline-flex items-center gap-1 font-medium underline rounded ${ANILLO_DE_FOCO}`}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Reintentar ahora
            </button>
          </div>
        )}

        {!tablero && errorDeCarga ? (
          <div className="rounded-xl border border-border/50 bg-card p-8 text-center space-y-4">
            <p role="alert" className="text-sm text-red-500">
              {errorDeCarga}
            </p>
            <BotonPrimario
              variante="secundario"
              tamaño="sm"
              onClick={recargar}
              icono={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
              className={ANILLO_DE_FOCO}
            >
              Reintentar
            </BotonPrimario>
          </div>
        ) : !listo ? (
          <TableroCargando />
        ) : (
          <TableroDeColumnas
            tablero={tablero}
            actor={actor}
            ahora={ahora}
            enCurso={enCurso}
            onLlego={llego}
            onMover={mover}
            onCobrar={cobrar}
            onEditar={(atencion) => editarServicios(atencion)}
            onAnular={(atencion) => abrirModal({ tipo: "anular", atencion })}
          />
        )}
      </div>

      <AnimatePresence>
        {tablero && modal?.tipo === "anotar" && (
          <ModalAnotarSinReserva
            key="anotar"
            catalogo={tablero.catalogo}
            eligeProfesional={puedeAsignarLineasAOtros(actor)}
            servicioObligatorio={!puedeVerTodoElTablero(actor)}
            puedeConfigurarServicios={puedeGestionarServicios(actor)}
            aviso={avisoDelModal}
            guardando={guardando}
            onAnotar={anotar}
            onCerrar={cerrarModal}
          />
        )}

        {tablero && modal?.tipo === "servicios" && (
          <ModalServicios
            key={`servicios-${modal.atencion.id}`}
            atencion={modal.atencion}
            catalogo={tablero.catalogo}
            eligeProfesional={puedeAsignarLineasAOtros(actor)}
            puedeConfigurarServicios={puedeGestionarServicios(actor)}
            requisito={modal.requisito}
            textoDelBoton={textoParaGuardar(modal.atencion, modal.despues)}
            aviso={avisoDelModal}
            guardando={guardando}
            onGuardar={(lineas) => guardarServiciosDe(modal, lineas)}
            onCerrar={cerrarModal}
          />
        )}

        {tablero && modal?.tipo === "cobro" && (
          <ModalCobro
            key={`cobro-${modal.atencion.id}`}
            atencion={modal.atencion}
            mediosDePago={tablero.catalogo.mediosDePago}
            aviso={avisoDelModal}
            guardando={guardando}
            onCobrar={(pagos) => cobrarCon(modal.atencion, pagos)}
            onCerrar={cerrarModal}
          />
        )}

        {modal?.tipo === "anular" && (
          <ModalAnular
            key={`anular-${modal.atencion.id}`}
            atencion={modal.atencion}
            aviso={avisoDelModal}
            guardando={guardando}
            onAnular={(motivo) => anular(modal.atencion, motivo)}
            onCerrar={cerrarModal}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
