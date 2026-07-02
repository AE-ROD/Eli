"use client"

import { useState, useEffect, useCallback } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Send } from "lucide-react"
import { BarraSuperior } from "@/components/app/layout/barra-superior"
import { ListaConversaciones, type ConversacionAPI, type MensajeAPI } from "./_components/listaConversaciones"
import { AreaChat } from "./_components/areaChat"
import { ModalNuevaConversacion, type FormNuevaConversacion } from "./_components/modalNuevaConversacion"

const FORM_INICIAL: FormNuevaConversacion = { titulo: "", contexto: "" }

export default function PaginaChats() {
  const [conversaciones, setConversaciones] = useState<ConversacionAPI[]>([])
  const [cargandoLista, setCargandoLista] = useState(true)
  const [busqueda, setBusqueda] = useState("")
  const [activa, setActiva] = useState<ConversacionAPI | null>(null)
  const [vistaMovil, setVistaMovil] = useState<"lista" | "chat">("lista")
  const [mensajesActivos, setMensajesActivos] = useState<MensajeAPI[]>([])
  const [cargandoMensajes, setCargandoMensajes] = useState(false)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [formNueva, setFormNueva] = useState<FormNuevaConversacion>(FORM_INICIAL)

  const fetchConversaciones = useCallback(async () => {
    setCargandoLista(true)
    try {
      const res = await fetch("/api/chats")
      if (res.ok) setConversaciones(await res.json())
    } catch { /* silencioso */ }
    finally { setCargandoLista(false) }
  }, [])

  useEffect(() => { fetchConversaciones() }, [fetchConversaciones])

  const seleccionarConversacion = async (conv: ConversacionAPI) => {
    setActiva(conv)
    setVistaMovil("chat")
    setMensajesActivos([])
    setCargandoMensajes(true)
    try {
      const res = await fetch(`/api/chats/${conv.id}`)
      if (res.ok) {
        const data = await res.json()
        setMensajesActivos(data.messages)
      }
    } catch { /* silencioso */ }
    finally { setCargandoMensajes(false) }
  }

  const enviarMensaje = async (texto: string) => {
    if (!activa) return
    const res = await fetch(`/api/chats/${activa.id}/mensajes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: texto }),
    })
    if (res.ok) {
      const nuevoMensaje: MensajeAPI = await res.json()
      setMensajesActivos((prev) => [...prev, nuevoMensaje])
      // Actualizar último mensaje en la lista
      setConversaciones((prev) =>
        prev.map((c) =>
          c.id === activa.id
            ? { ...c, updatedAt: nuevoMensaje.createdAt, messages: [nuevoMensaje] }
            : c
        ).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      )
    }
  }

  const crearConversacion = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault()
    setGuardando(true)
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName: formNueva.titulo,
          patientPhone: formNueva.contexto || undefined,
        }),
      })
      if (res.ok) {
        const nueva: ConversacionAPI = await res.json()
        setConversaciones((prev) => [nueva, ...prev])
        setModalAbierto(false)
        setFormNueva(FORM_INICIAL)
        seleccionarConversacion(nueva)
      }
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <BarraSuperior
        titulo="Mensajería interna"
        subtitulo={
          cargandoLista ? "Cargando..." : `${conversaciones.length} conversaciones del equipo`
        }
        mostrarBusqueda={false}
      />

      <div className="flex-1 flex overflow-hidden">
        <div className={`${vistaMovil === "chat" ? "hidden" : "flex"} w-full lg:flex lg:w-auto`}>
          <ListaConversaciones
            conversaciones={conversaciones}
            busqueda={busqueda}
            onBusqueda={setBusqueda}
            activaId={activa?.id ?? null}
            onSeleccionar={seleccionarConversacion}
            onNueva={() => setModalAbierto(true)}
          />
        </div>

        {activa ? (
          <div className={`${vistaMovil === "lista" ? "hidden" : "flex"} min-w-0 flex-1 lg:flex`}>
            <AreaChat
              conversacion={activa}
              mensajesAPI={mensajesActivos}
              cargando={cargandoMensajes}
              onEnviar={enviarMensaje}
              onVolver={() => setVistaMovil("lista")}
            />
          </div>
        ) : (
          <div className="hidden flex-1 items-center justify-center bg-muted/30 lg:flex">
            <motion.div
              className="text-center"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Send className="h-10 w-10 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">Conversaciones del equipo</h3>
              <p className="text-muted-foreground text-sm">
                Selecciona un tema para coordinar turnos, avisos o problemas operativos.
              </p>
            </motion.div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {modalAbierto && (
          <ModalNuevaConversacion
            form={formNueva}
            guardando={guardando}
            onFormChange={(campo, valor) => setFormNueva((p) => ({ ...p, [campo]: valor }))}
            onSubmit={crearConversacion}
            onCerrar={() => setModalAbierto(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
