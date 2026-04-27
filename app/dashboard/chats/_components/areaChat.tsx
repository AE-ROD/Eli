"use client"

import { useRef, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Send, Phone, Video, Calendar, MoreVertical, Smile } from "lucide-react"
import { AvatarUsuario } from "@/components/app/comunes/avatar-usuario"
import { BurbujaMensaje, type Mensaje } from "@/components/app/comunes/burbuja-mensaje"
import type { ConversacionAPI, MensajeAPI } from "./listaConversaciones"

const RESPUESTAS_RAPIDAS = [
  "¡Hola! ¿En qué puedo ayudarte?",
  "Tu cita está confirmada",
  "Te envío los detalles por aquí",
  "¿Prefieres llamar para más información?",
]

function mensajeAPIaMensaje(m: MensajeAPI): Mensaje {
  return {
    id: m.id,
    texto: m.content,
    hora: new Date(m.createdAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
    esPropio: m.fromBusiness,
    leido: m.fromBusiness,
  }
}

interface AreaChatProps {
  conversacion: ConversacionAPI
  mensajesAPI: MensajeAPI[]
  cargando: boolean
  onEnviar: (texto: string) => Promise<void>
}

export function AreaChat({ conversacion, mensajesAPI, cargando, onEnviar }: AreaChatProps) {
  const [texto, setTexto] = useState("")
  const [enviando, setEnviando] = useState(false)
  const mensajesRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (mensajesRef.current) {
      mensajesRef.current.scrollTop = mensajesRef.current.scrollHeight
    }
  }, [mensajesAPI])

  const handleEnviar = async () => {
    const trimmed = texto.trim()
    if (!trimmed || enviando) return
    setTexto("")
    setEnviando(true)
    try {
      await onEnviar(trimmed)
    } finally {
      setEnviando(false)
    }
  }

  const mensajes: Mensaje[] = mensajesAPI.map(mensajeAPIaMensaje)

  return (
    <div className="flex-1 flex flex-col bg-background min-w-0">
      {/* Cabecera */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border/50 bg-card flex-shrink-0">
        <div className="flex items-center gap-3">
          <AvatarUsuario nombre={conversacion.patientName} tamaño="md" />
          <div>
            <h3 className="font-semibold text-foreground">{conversacion.patientName}</h3>
            {conversacion.patientPhone && (
              <p className="text-xs text-muted-foreground">{conversacion.patientPhone}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {conversacion.patientPhone && (
            <a
              href={`tel:${conversacion.patientPhone}`}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
            >
              <Phone className="h-5 w-5 text-muted-foreground" />
            </a>
          )}
          <button className="p-2 rounded-lg hover:bg-muted transition-colors">
            <Video className="h-5 w-5 text-muted-foreground" />
          </button>
          <button className="p-2 rounded-lg hover:bg-muted transition-colors">
            <Calendar className="h-5 w-5 text-muted-foreground" />
          </button>
          <button className="p-2 rounded-lg hover:bg-muted transition-colors">
            <MoreVertical className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
      </header>

      {/* Mensajes */}
      <div ref={mensajesRef} className="flex-1 overflow-y-auto p-6 space-y-4">
        {cargando ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : mensajes.length === 0 ? (
          <div className="flex justify-center py-8">
            <p className="text-sm text-muted-foreground">Sin mensajes aún. ¡Sé el primero en escribir!</p>
          </div>
        ) : (
          mensajes.map((m) => <BurbujaMensaje key={m.id} mensaje={m} />)
        )}
      </div>

      {/* Respuestas rápidas */}
      <div className="px-6 py-2 flex gap-2 overflow-x-auto border-t border-border/30 flex-shrink-0">
        {RESPUESTAS_RAPIDAS.map((r, i) => (
          <button
            key={i}
            onClick={() => setTexto(r)}
            className="px-3 py-1.5 rounded-full bg-muted text-xs text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors whitespace-nowrap"
          >
            {r}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border/50 bg-card flex-shrink-0">
        <div className="flex items-end gap-3">
          <div className="flex-1 relative">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleEnviar()
                }
              }}
              placeholder="Escribe un mensaje..."
              rows={1}
              className="w-full px-4 py-3 pr-10 rounded-xl border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 max-h-32"
            />
            <button className="absolute right-3 bottom-3">
              <Smile className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
            </button>
          </div>
          <motion.button
            onClick={handleEnviar}
            disabled={!texto.trim() || enviando}
            className="p-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Send className="h-5 w-5" />
          </motion.button>
        </div>
      </div>
    </div>
  )
}
