"use client"

import { useRef, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { AlertCircle, ArrowLeft, Send, Smile, UsersRound } from "lucide-react"
import { AvatarUsuario } from "@/components/app/comunes/avatar-usuario"
import { BurbujaMensaje, type Mensaje } from "@/components/app/comunes/burbuja-mensaje"
import type { ConversacionAPI, MensajeAPI } from "./listaConversaciones"

const RESPUESTAS_RAPIDAS = [
  "¿Cuántas personas quedan por atender hoy?",
  "Estoy teniendo un problema en recepción",
  "¿Alguien puede apoyar este turno?",
  "Queda actualizado el estado de la agenda",
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
  onVolver?: () => void
}

export function AreaChat({ conversacion, mensajesAPI, cargando, onEnviar, onVolver }: AreaChatProps) {
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
      <header className="flex items-center justify-between px-4 py-4 border-b border-border/50 bg-card flex-shrink-0 sm:px-6">
        <div className="flex items-center gap-3">
          {onVolver && (
            <button
              type="button"
              onClick={onVolver}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
              aria-label="Volver a conversaciones"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <AvatarUsuario nombre={conversacion.patientName} tamaño="md" />
          <div>
            <h3 className="font-semibold text-foreground">{conversacion.patientName}</h3>
            {conversacion.patientPhone && (
              <p className="text-xs text-muted-foreground">{conversacion.patientPhone}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <span className="hidden items-center gap-1 rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground sm:flex">
            <UsersRound className="h-3.5 w-3.5" />
            Equipo
          </span>
          <span className="hidden items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-xs text-primary sm:flex">
            <AlertCircle className="h-3.5 w-3.5" />
            Interno
          </span>
        </div>
      </header>

      {/* Mensajes */}
      <div ref={mensajesRef} className="flex-1 overflow-y-auto p-4 space-y-4 sm:p-6">
        {cargando ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : mensajes.length === 0 ? (
          <div className="flex justify-center py-8">
            <p className="text-sm text-muted-foreground">Sin mensajes aún. Deja la primera actualización para el equipo.</p>
          </div>
        ) : (
          mensajes.map((m) => <BurbujaMensaje key={m.id} mensaje={m} />)
        )}
      </div>

      {/* Respuestas rápidas */}
      <div className="px-4 py-2 flex gap-2 overflow-x-auto border-t border-border/30 flex-shrink-0 sm:px-6">
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
              placeholder="Escribe una actualización para el equipo..."
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
