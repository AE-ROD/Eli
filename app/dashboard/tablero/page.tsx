"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSession } from "next-auth/react"
import { AnimatePresence } from "framer-motion"
import { CircleAlert, RefreshCw, UserPlus } from "lucide-react"
import { BarraSuperior } from "@/components/panel/barra-superior"
import { Boton } from "@/components/comunes/boton"
import { ModalAnular } from "@/components/panel/modal-anular"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { esEstadoActivo, type EstadoActivo, type PagoPedido } from "@/lib/atenciones"
import { formatearMonto } from "@/lib/dinero"
import {
  requisitoParaPasarA,
  textoDeMovimiento,
  type ColumnaDeAtencion,
  type LineaPedida,
} from "@/lib/acciones-del-tablero"
import {
  actorDeSesion,
  puedeAnotarSinReserva,
  puedeAsignarLineasAOtros,
  puedeGestionarServicios,
  puedeVerTodoElTablero,
} from "@/lib/permisos"
import { cn } from "@/lib/utils"
import {
  anotarSinReserva,
  anularAtencion,
  cobrarAtencion,
  deshacerLlegada,
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
import { Aviso } from "@/components/panel/aviso"
import { TableroCargando, TableroDeColumnas, type DestinoDelFoco } from "./_componentes/tablero-de-columnas"
import { ModalAnotarSinReserva } from "./_componentes/modal-anotar-sin-reserva"
import { ModalServicios } from "./_componentes/modal-servicios"
import { ModalCobro } from "./_componentes/modal-cobro"

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
  const fecha = new Date(instante).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })
  return fecha.charAt(0).toUpperCase() + fecha.slice(1)
}

/** "Guardar", o "Guardar y …" con lo que se va a hacer después. */
function textoParaGuardar(atencion: Atencion, despues: Despues | null): string {
  if (!despues) return "Guardar"
  if (despues.tipo === "cobrar") return "Guardar y cobrar"
  const accion = textoDeMovimiento(atencion.estado, despues.hacia)
  return `Guardar y ${accion.charAt(0).toLowerCase()}${accion.slice(1)}`
}

/** La columna de una atención: la de su estado. Las anuladas no tienen; por las dudas, "En espera". */
function columnaDe(atencion: Atencion): ColumnaDeAtencion {
  return esEstadoActivo(atencion.estado) || atencion.estado === "finalizada" ? atencion.estado : "en-espera"
}

/** La tarjeta de una atención, en la columna donde estaba: adonde vuelve el foco si se recarga. */
const tarjetaDe = (atencion: Atencion): DestinoDelFoco => ({ atencionId: atencion.id, columna: columnaDe(atencion) })

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
  /** Adonde va el foco cuando se dibuje lo que cambió (ver `DestinoDelFoco`). */
  const [foco, setFoco] = useState<DestinoDelFoco | null>(null)

  const [modal, setModal] = useState<ModalAbierto | null>(null)
  const [avisoDelModal, setAvisoDelModal] = useState("")
  const [guardando, setGuardando] = useState(false)

  // El número del último pedido de recarga: si llega la respuesta de uno
  // anterior (más lento), se descarta en vez de pisar datos más nuevos.
  const ultimoPedido = useRef(0)
  const inicioDeLaUltimaRecarga = useRef(0)

  // Guardas contra el doble envío. El estado (`guardando`, `enCurso`) dibuja
  // el botón ocupado, pero recién en el render siguiente: un doble clic o un
  // Enter repetido llegaban antes y mandaban el pedido dos veces. El segundo
  // encontraba la atención ya movida y avisaba "La atención cambió" aunque la
  // acción hubiera salido bien. Un ref se lee al instante.
  const enviandoDesdeUnModal = useRef(false)
  const idsEnviando = useRef(new Set<string>())

  /** Pide el tablero y lo muestra. Devuelve lo que llegó, o `null` si falló o ya había otro pedido más nuevo. */
  const recargar = useCallback(async (): Promise<Tablero | null> => {
    const numero = ++ultimoPedido.current
    inicioDeLaUltimaRecarga.current = Date.now()
    // El día se calcula en cada recarga: si la pestaña sigue abierta pasada
    // la medianoche, la siguiente recarga ya trae el día nuevo.
    const resultado = await leerTablero(new Date())
    if (numero !== ultimoPedido.current) return null

    setAhora(Date.now())
    if (!resultado.ok) {
      setErrorDeCarga(resultado.error)
      return null
    }
    setTablero(resultado.datos)
    setErrorDeCarga("")
    return resultado.datos
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

  const focoAplicado = useCallback(() => setFoco(null), [])

  // ─── Cambios locales, mientras llega la recarga ───────────────────────────

  const marcarEnCurso = (id: string, activo: boolean) =>
    setEnCurso((previos) => {
      const siguientes = new Set(previos)
      if (activo) siguientes.add(id)
      else siguientes.delete(id)
      return siguientes
    })

  /**
   * Una acción de tarjeta, una sola vez por tarjeta a la vez: mientras su
   * pedido no vuelve, otro clic, otro Enter o soltarla en otra columna no
   * mandan nada.
   */
  const enTarjeta = async (id: string, accion: () => Promise<void>) => {
    if (idsEnviando.current.has(id)) return
    idsEnviando.current.add(id)
    marcarEnCurso(id, true)
    try {
      await accion()
    } finally {
      idsEnviando.current.delete(id)
      marcarEnCurso(id, false)
    }
  }

  /** Lo que confirma un modal, una sola vez: el segundo envío se descarta mientras el primero no vuelve. */
  const desdeUnModal = async (accion: () => Promise<void>) => {
    if (enviandoDesdeUnModal.current) return
    enviandoDesdeUnModal.current = true
    setGuardando(true)
    setAvisoDelModal("")
    try {
      await accion()
    } finally {
      enviandoDesdeUnModal.current = false
    }
  }

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

  const quitarAtencion = (id: string) =>
    setTablero((previo) => previo && { ...previo, atenciones: previo.atenciones.filter((otra) => otra.id !== id) })

  /** El foco sigue a la atención a su columna nueva (o, si ya no se ve, a esa columna). */
  const seguirA = (atencion: Atencion) => setFoco({ atencionId: atencion.id, columna: columnaDe(atencion) })

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

  /**
   * Lo que se veía quedó viejo: se cierra lo abierto, se avisa y se recarga.
   *
   * La recarga se puede llevar el botón que se apretó (la atención la movió
   * otro, o la reserva ya llegó), y el foco caía al `<body>`. Cuando llega el
   * tablero nuevo, el foco va a la tarjeta en su lugar nuevo o, si ya no
   * está, al título de su columna: lugares que la recarga no se lleva. Se
   * espera a la recarga para no enfocar la tarjeta vieja, que se desmonta
   * apenas llega la nueva.
   */
  const tableroDesactualizado = (destino: DestinoDelFoco, mensaje = AVISO_DE_CAMBIO) => {
    cerrarModal()
    setAviso(mensaje)
    recargar().then(() => setFoco(destino))
  }

  /** Un fallo dentro de un modal: si el tablero quedó viejo se recarga; si no, se avisa adentro. */
  const falloEnModal = (fallo: { error: string; motivo: MotivoDeFallo }, atencion: Atencion) => {
    setGuardando(false)
    if (fallo.motivo === "desactualizada") return tableroDesactualizado(tarjetaDe(atencion))
    setAvisoDelModal(fallo.error)
  }

  // ─── Acciones de las tarjetas ─────────────────────────────────────────────

  const llego = (reserva: Reserva) =>
    enTarjeta(reserva.id, async () => {
      setAviso("")
      const resultado = await marcarLlegada(reserva.id)

      if (!resultado.ok) {
        // Otro ya la marcó, la cancelaron o no es de hoy: el mensaje del
        // servidor dice cuál, y se muestra tal cual.
        if (resultado.motivo === "desactualizada") {
          return tableroDesactualizado({ reservaId: reserva.id, columna: "reservas" }, conRecarga(resultado.error))
        }
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
      seguirA(atencion)
      recargar()
    })

  /** La llegada se marcó por error: la atención se borra y la reserva vuelve a "Reservas de hoy". */
  const deshacer = (atencion: Atencion) =>
    enTarjeta(atencion.id, async () => {
      setAviso("")
      const resultado = await deshacerLlegada(atencion.id)

      if (!resultado.ok) {
        // Ya empezó, o ya no está: se dice por qué y se recarga.
        if (resultado.motivo === "desactualizada") return tableroDesactualizado(tarjetaDe(atencion), conRecarga(resultado.error))
        return setAviso(resultado.error)
      }

      quitarAtencion(atencion.id)
      // La reserva vuelve con la recarga; el foco, al título de su columna.
      setFoco({ columna: "reservas" })
      recargar()
    })

  const editarServicios = (atencion: Atencion, despues: Despues | null = null, requisito: string | null = null) =>
    abrirModal({ tipo: "servicios", atencion, despues, requisito })

  /**
   * Mover a otra columna. Si se sabe que falta algo, no se le pregunta al
   * servidor para recibir un 400: se abre el editor de servicios, y al
   * guardar se sigue con el movimiento.
   */
  const mover = (atencion: Atencion, hacia: EstadoActivo) => {
    setAviso("")
    const falta = requisitoParaPasarA(atencion.lineas, hacia)
    if (falta) return editarServicios(atencion, { tipo: "mover", hacia }, falta)

    return enTarjeta(atencion.id, async () => {
      const resultado = await moverAtencion(atencion.id, hacia)

      if (!resultado.ok) {
        if (resultado.motivo === "desactualizada") return tableroDesactualizado(tarjetaDe(atencion))
        // El profesional ve sólo sus líneas: lo que falta puede estar en las de
        // otro, y eso lo sabe el servidor. Se abre el editor con su mensaje.
        if (resultado.motivo === "falta-requisito") {
          return editarServicios(atencion, { tipo: "mover", hacia }, resultado.error)
        }
        return setAviso(resultado.error)
      }

      ponerAtencion(resultado.datos)
      seguirA(resultado.datos)
      recargar()
    })
  }

  /** Cobrar. Si a alguna línea le falta quién la hizo, primero el editor; si no, el cobro. */
  const cobrar = (atencion: Atencion) => {
    const falta = requisitoParaPasarA(atencion.lineas, "finalizada")
    if (falta) return editarServicios(atencion, { tipo: "cobrar" }, falta)
    abrirModal({ tipo: "cobro", atencion })
  }

  // ─── Lo que confirman los modales ─────────────────────────────────────────

  const guardarServiciosDe = (abierto: ModalDeServicios, lineas: LineaPedida[]) =>
    desdeUnModal(async () => {
      const guardado = await guardarServicios(abierto.atencion.id, lineas)
      if (!guardado.ok) return falloEnModal(guardado, abierto.atencion)

      const atencion = guardado.datos
      ponerAtencion(atencion)

      const { despues } = abierto
      if (!despues) {
        // La tarjeta no se movió: el foco vuelve solo al botón que abrió el editor.
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
        return falloEnModal(movida, atencion)
      }
      ponerAtencion(movida.datos)
      cerrarModal()
      seguirA(movida.datos)
      recargar()
    })

  const cobrarCon = (atencion: Atencion, pagos: PagoPedido[]) =>
    desdeUnModal(async () => {
      const resultado = await cobrarAtencion(atencion.id, pagos)

      if (resultado.ok) {
        ponerAtencion(resultado.datos)
        cerrarModal()
        seguirA(resultado.datos)
        recargar()
        return
      }

      if (resultado.motivo !== "falta-requisito") return falloEnModal(resultado, atencion)

      // Un 400 con los pagos cuadrados contra el total que se veía: la
      // atención cambió en el servidor (otro le sumó o le quitó un servicio)
      // y el total ya es otro. Se recarga y el cobro sigue abierto con el
      // total nuevo, los pagos escritos y el mensaje del servidor.
      const fresco = await recargar()
      const actual = fresco?.atenciones.find((otra) => otra.id === atencion.id)
      if (!actual || actual.estado !== "por-cobrar" || requisitoParaPasarA(actual.lineas, "finalizada")) {
        // Ya no se puede cobrar desde acá: la movieron, o le falta algo que
        // se completa en el editor. Se cierra y se dice por qué.
        return tableroDesactualizado(tarjetaDe(atencion), conRecarga(resultado.error))
      }
      setModal({ tipo: "cobro", atencion: actual })
      setGuardando(false)
      const totalNuevo = actual.total
      setAvisoDelModal(
        totalNuevo !== undefined && totalNuevo !== atencion.total
          ? `El total cambió mientras tanto: ahora es ${formatearMonto(totalNuevo)}. ${resultado.error}`
          : resultado.error
      )
    })

  const anular = (atencion: Atencion, motivo: string) =>
    desdeUnModal(async () => {
      const resultado = await anularAtencion(atencion.id, motivo)
      if (!resultado.ok) return falloEnModal(resultado, atencion)

      // Las anuladas no tienen columna: sale del tablero, y el foco va al
      // título de la columna donde estaba.
      quitarAtencion(atencion.id)
      cerrarModal()
      setFoco({ columna: columnaDe(atencion) })
      recargar()
    })

  const anotar = (datos: DatosSinReserva) =>
    desdeUnModal(async () => {
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
      seguirA(resultado.datos)
      recargar()
    })

  // ─── Pantalla ─────────────────────────────────────────────────────────────

  const listo = tablero !== null && estadoDeSesion !== "loading"
  const puedeAnotar = listo && puedeAnotarSinReserva(actor)

  return (
    <div className="min-h-screen">
      {/* En el teléfono la cabecera muestra la acción como botón de ícono: no hace falta otro abajo. */}
      <BarraSuperior
        titulo="Tablero"
        subtitulo={ahora ? fechaLarga(ahora) : "Cargando..."}
        accionPrincipal={
          puedeAnotar ? { texto: "Anotar sin reserva", onClick: () => abrirModal({ tipo: "anotar" }), icono: UserPlus } : undefined
        }
      />

      <div className="space-y-4 px-4 pb-8 pt-4 sm:px-6 sm:pt-6">
        {aviso && (
          <Aviso tono="error" rol="alert">
            {aviso}
          </Aviso>
        )}

        {tablero && errorDeCarga && (
          <Aviso
            tono="error"
            rol="alert"
            accion={
              <Boton variante="secundario" tamano="sm" onClick={recargar}>
                <RefreshCw aria-hidden="true" className="size-4" strokeWidth={2} />
                Reintentar ahora
              </Boton>
            }
          >
            No se pudo actualizar el tablero: {errorDeCarga}. Se vuelve a intentar solo.
          </Aviso>
        )}

        {listo && tablero.truncado && (
          <Aviso tono="atencion" rol="status">
            Hay más atenciones de las que el tablero muestra de una vez: algunas no se ven.
          </Aviso>
        )}

        {!tablero && errorDeCarga ? (
          <div className={cn(TARJETA_DEL_PANEL, "flex flex-col items-center gap-4 px-6 py-10 text-center")}>
            <p role="alert" className="flex max-w-md items-start gap-2 text-sm font-medium text-error">
              <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
              {errorDeCarga}
            </p>
            <Boton variante="secundario" tamano="sm" onClick={recargar}>
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={2} />
              Reintentar
            </Boton>
          </div>
        ) : !listo ? (
          <TableroCargando />
        ) : (
          <TableroDeColumnas
            tablero={tablero}
            actor={actor}
            ahora={ahora}
            enCurso={enCurso}
            foco={foco}
            onFocoAplicado={focoAplicado}
            onLlego={llego}
            onDeshacerLlegada={deshacer}
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
            onCambiarPagos={() => setAvisoDelModal("")}
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
