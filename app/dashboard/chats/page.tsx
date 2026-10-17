"use client"

import { useState, useEffect, useCallback } from "react"
import { AnimatePresence } from "framer-motion"
import { Aviso } from "@/components/panel/aviso"
import { BarraSuperior } from "@/components/panel/barra-superior"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { cn } from "@/lib/utils"
import {
  leerConversaciones,
  leerMensajes,
  enviarMensaje,
  crearConversacion,
  type Conversacion,
  type DatosDeNuevaConversacion,
  type Mensaje,
} from "./_datos"
import { ListaConversaciones } from "./_componentes/lista-conversaciones"
import { AreaChat } from "./_componentes/area-chat"
import { ModalNuevaConversacion } from "./_componentes/modal-nueva-conversacion"
import { SinConversacionAbierta } from "./_componentes/sin-conversacion-abierta"

const CONVERSACION_EN_BLANCO: DatosDeNuevaConversacion = { nombre: "", telefono: "" }

/** Desde md la lista y la conversación van lado a lado; por debajo, una u otra. */
const CONSULTA_DE_DOS_COLUMNAS = "(min-width: 48rem)"

function resumen(cargando: boolean, cantidad: number): string {
  if (cargando) return "Cargando..."
  return cantidad === 1 ? "1 conversación" : `${cantidad} conversaciones`
}

export default function PaginaChats() {
  const [conversaciones, setConversaciones] = useState<Conversacion[]>([])
  const [cargandoLista, setCargandoLista] = useState(true)
  const [busqueda, setBusqueda] = useState("")
  const [activa, setActiva] = useState<Conversacion | null>(null)
  const [mensajesActivos, setMensajesActivos] = useState<Mensaje[]>([])
  const [cargandoMensajes, setCargandoMensajes] = useState(false)
  const [aviso, setAviso] = useState("")
  const [modalAbierto, setModalAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [avisoDelModal, setAvisoDelModal] = useState("")
  const [nuevaConversacion, setNuevaConversacion] = useState<DatosDeNuevaConversacion>(CONVERSACION_EN_BLANCO)
  // En el teléfono se ve la lista o la conversación, no las dos: el foco
  // acompaña el cambio en vez de quedarse en algo que se ocultó.
  const [enfocarConversacion, setEnfocarConversacion] = useState(false)
  const [volverA, setVolverA] = useState<string | null>(null)

  const cargarConversaciones = useCallback(async () => {
    setCargandoLista(true)
    const resultado = await leerConversaciones()
    if (resultado.ok) setConversaciones(resultado.datos)
    else setAviso(resultado.error)
    setCargandoLista(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- carga la lista de conversaciones al montar
  useEffect(() => { cargarConversaciones() }, [cargarConversaciones])

  const abrirConversacion = async (conversacion: Conversacion) => {
    setEnfocarConversacion(!window.matchMedia(CONSULTA_DE_DOS_COLUMNAS).matches)
    setVolverA(null)
    setAviso("")
    setActiva(conversacion)
    setMensajesActivos([])
    setCargandoMensajes(true)
    const resultado = await leerMensajes(conversacion.id)
    if (resultado.ok) setMensajesActivos(resultado.datos)
    else setAviso(resultado.error)
    setCargandoMensajes(false)
  }

  const volverALaLista = () => {
    setVolverA(activa?.id ?? null)
    setActiva(null)
  }

  const enviar = async (texto: string) => {
    if (!activa) return

    setAviso("")
    const resultado = await enviarMensaje(activa.id, texto)
    if (!resultado.ok) return setAviso(resultado.error)

    const nuevoMensaje = resultado.datos
    setMensajesActivos((previos) => [...previos, nuevoMensaje])
    // La lista muestra el último mensaje de cada conversación y las ordena por
    // actividad: la que acaba de recibir uno pasa a ir primera.
    setConversaciones((previas) =>
      previas
        .map((conversacion) =>
          conversacion.id === activa.id
            ? { ...conversacion, updatedAt: nuevoMensaje.createdAt, messages: [nuevoMensaje] }
            : conversacion
        )
        .sort((una, otra) => new Date(otra.updatedAt).getTime() - new Date(una.updatedAt).getTime())
    )
  }

  const abrirModal = () => {
    setAvisoDelModal("")
    setModalAbierto(true)
  }

  const guardarNuevaConversacion = async (evento: React.SyntheticEvent<HTMLFormElement>) => {
    evento.preventDefault()

    setAvisoDelModal("")
    setGuardando(true)
    const resultado = await crearConversacion(nuevaConversacion)
    setGuardando(false)

    // El aviso va dentro del modal, que sigue abierto con lo que se cargó: en
    // la página quedaría tapado por el velo del modal.
    if (!resultado.ok) return setAvisoDelModal(resultado.error)

    const creada = resultado.datos
    setConversaciones((previas) => [creada, ...previas])
    setModalAbierto(false)
    setNuevaConversacion(CONVERSACION_EN_BLANCO)
    abrirConversacion(creada)
  }

  return (
    // Del alto de la pantalla: la lista y los mensajes se desplazan adentro, y el campo para escribir queda a la vista.
    <div className="flex h-dvh min-h-[36rem] flex-col">
      <BarraSuperior titulo="Chats" subtitulo={resumen(cargandoLista, conversaciones.length)} mostrarBusqueda={false} />

      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pt-6 pb-4 sm:px-6 sm:pb-6">
        {aviso && <Aviso>{aviso}</Aviso>}

        <div className={cn(TARJETA_DEL_PANEL, "flex min-h-0 flex-1 overflow-hidden")}>
          <ListaConversaciones
            conversaciones={conversaciones}
            busqueda={busqueda}
            onBusqueda={setBusqueda}
            activaId={activa?.id ?? null}
            onSeleccionar={abrirConversacion}
            onNueva={abrirModal}
            enfocarId={volverA}
            className={activa ? "hidden md:flex" : "flex"}
          />

          {activa ? (
            <AreaChat
              conversacion={activa}
              mensajes={mensajesActivos}
              cargando={cargandoMensajes}
              onEnviar={enviar}
              onVolver={volverALaLista}
              enfocarAlAbrir={enfocarConversacion}
              className="flex"
            />
          ) : (
            <SinConversacionAbierta className="hidden md:flex" />
          )}
        </div>
      </div>

      <AnimatePresence>
        {modalAbierto && (
          <ModalNuevaConversacion
            form={nuevaConversacion}
            guardando={guardando}
            aviso={avisoDelModal}
            onCambiarCampo={(campo, valor) => setNuevaConversacion((previa) => ({ ...previa, [campo]: valor }))}
            onSubmit={guardarNuevaConversacion}
            onCerrar={() => setModalAbierto(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
