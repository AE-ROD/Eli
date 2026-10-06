"use client"

import { motion } from "framer-motion"
import { Check, CheckCheck } from "lucide-react"

/**
 * Un mensaje tal como lo dibuja la burbuja, con la hora ya escrita. No es el
 * `Mensaje` del servidor; se arma con `mensajeParaBurbuja` en `area-chat.tsx`.
 */
export interface MensajeEnBurbuja {
  id: string
  texto: string
  hora: string
  esPropio: boolean
  leido?: boolean
  tipo?: "texto" | "imagen" | "archivo"
}

interface BurbujaMensajeProps {
  mensaje: MensajeEnBurbuja
}

export function BurbujaMensaje({ mensaje }: BurbujaMensajeProps) {
  return (
    <motion.div
      className={`flex ${mensaje.esPropio ? "justify-end" : "justify-start"}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div
        className={`
          max-w-[75%] px-4 py-2.5 rounded-2xl
          ${mensaje.esPropio 
            ? "bg-primary text-primary-foreground rounded-br-md" 
            : "bg-muted text-foreground rounded-bl-md"
          }
        `}
      >
        <p className="text-sm leading-relaxed">{mensaje.texto}</p>
        <div className={`flex items-center justify-end gap-1 mt-1 ${mensaje.esPropio ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
          <span className="text-xs">{mensaje.hora}</span>
          {mensaje.esPropio && (
            mensaje.leido 
              ? <CheckCheck className="h-3 w-3" />
              : <Check className="h-3 w-3" />
          )}
        </div>
      </div>
    </motion.div>
  )
}
