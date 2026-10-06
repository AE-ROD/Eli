"use client"

import { motion } from "framer-motion"
import { Send } from "lucide-react"

/** Lo que ocupa el lugar del chat mientras no se eligió ninguna conversación. */
export function SinConversacionAbierta() {
  return (
    <div className="flex-1 flex items-center justify-center bg-muted/30">
      <motion.div
        className="text-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
          <Send className="h-10 w-10 text-muted-foreground" />
        </div>
        <h3 className="text-xl font-semibold text-foreground mb-2">Tus mensajes</h3>
        <p className="text-muted-foreground text-sm">
          Selecciona una conversación para comenzar a chatear
        </p>
      </motion.div>
    </div>
  )
}
