"use client"

import { useState, useEffect, useCallback } from "react"
import { AnimatePresence } from "framer-motion"
import { BarraSuperior } from "@/components/panel/barra-superior"
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
    setAviso("")
    setActiva(conversacion)
    setMensajesActivos([])
    setCargandoMensajes(true)
    const resultado = await leerMensajes(conversacion.id)
    if (resultado.ok) setMensajesActivos(resultado.datos)
    else setAviso(resultado.error)
    setCargandoMensajes(false)
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
    <div className="min-h-screen flex flex-col">
      <BarraSuperior
        titulo="Chats"
        subtitulo={
          cargandoLista ? "Cargando..." : `${conversaciones.length} conversaciones`
        }
        mostrarBusqueda={false}
      />

      {aviso && (
        <p role="alert" className="text-sm text-red-500 px-6 py-3">
          {aviso}
        </p>
      )}

      <div className="flex-1 flex overflow-hidden">
        <ListaConversaciones
          conversaciones={conversaciones}
          busqueda={busqueda}
          onBusqueda={setBusqueda}
          activaId={activa?.id ?? null}
          onSeleccionar={abrirConversacion}
          onNueva={abrirModal}
        />

        {activa ? (
          <AreaChat
            conversacion={activa}
            mensajes={mensajesActivos}
            cargando={cargandoMensajes}
            onEnviar={enviar}
          />
        ) : (
          <SinConversacionAbierta />
        )}
      </div>

      <AnimatePresence>
        {modalAbierto && (
          <ModalNuevaConversacion
            form={nuevaConversacion}
            guardando={guardando}
            aviso={avisoDelModal}
            onFormChange={(campo, valor) => setNuevaConversacion((previa) => ({ ...previa, [campo]: valor }))}
            onSubmit={guardarNuevaConversacion}
            onCerrar={() => setModalAbierto(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
