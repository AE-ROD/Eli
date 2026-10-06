"use client"

import { motion } from "framer-motion"
import { Search, MessageSquarePlus } from "lucide-react"
import { AvatarUsuario } from "@/components/panel/avatar-usuario"
import type { Conversacion } from "../_datos"

/** `Ahora`, `5m`, `14:30`, `Mié` o `8 mar`, según cuánto pasó. */
function formatearHoraRelativa(iso: string): string {
  const segundos = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (segundos < 60) return "Ahora"
  if (segundos < 3600) return `${Math.floor(segundos / 60)}m`
  if (segundos < 86400) return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
  if (segundos < 604800) return ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"][new Date(iso).getDay()]
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" })
}

interface ListaConversacionesProps {
  conversaciones: Conversacion[]
  busqueda: string
  onBusqueda: (busqueda: string) => void
  activaId: string | null
  onSeleccionar: (conversacion: Conversacion) => void
  onNueva: () => void
}

export function ListaConversaciones({
  conversaciones,
  busqueda,
  onBusqueda,
  activaId,
  onSeleccionar,
  onNueva,
}: ListaConversacionesProps) {
  const filtradas = conversaciones.filter((conversacion) =>
    conversacion.customerName.toLowerCase().includes(busqueda.toLowerCase()) ||
    (conversacion.customerPhone ?? "").includes(busqueda)
  )

  return (
    <aside className="w-80 border-r border-border/50 bg-card flex flex-col flex-shrink-0">
      <div className="p-4 border-b border-border/50 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar conversación..."
            value={busqueda}
            onChange={(e) => onBusqueda(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <button
          onClick={onNueva}
          className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          title="Nueva conversación"
        >
          <MessageSquarePlus className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtradas.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Sin conversaciones
          </div>
        ) : (
          filtradas.map((conversacion) => {
            const ultimo = conversacion.messages[0]
            return (
              <motion.button
                key={conversacion.id}
                className={`w-full p-4 flex items-start gap-3 hover:bg-muted/50 transition-colors text-left ${
                  activaId === conversacion.id ? "bg-primary/5 border-l-2 border-primary" : ""
                }`}
                onClick={() => onSeleccionar(conversacion)}
                whileHover={{ x: 2 }}
              >
                <AvatarUsuario nombre={conversacion.customerName} tamaño="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-foreground truncate">{conversacion.customerName}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {formatearHoraRelativa(conversacion.updatedAt)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate">
                    {ultimo
                      ? (ultimo.fromBusiness ? "Tú: " : "") + ultimo.content
                      : "Sin mensajes"}
                  </p>
                </div>
              </motion.button>
            )
          })
        )}
      </div>
    </aside>
  )
}
