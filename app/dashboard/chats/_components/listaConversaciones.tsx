"use client"

import { motion } from "framer-motion"
import { Search, MessageSquarePlus } from "lucide-react"
import { AvatarUsuario } from "@/components/eli/app/avatar-usuario"

export interface MensajeAPI {
  id: string
  content: string
  fromBusiness: boolean
  createdAt: string
}

export interface ConversacionAPI {
  id: string
  patientName: string
  patientPhone: string | null
  updatedAt: string
  messages: MensajeAPI[]
}

function formatearHoraRelativa(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60) return "Ahora"
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })
  if (diff < 604800) return ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"][new Date(iso).getDay()]
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" })
}

interface ListaConversacionesProps {
  conversaciones: ConversacionAPI[]
  busqueda: string
  onBusqueda: (v: string) => void
  activaId: string | null
  onSeleccionar: (conv: ConversacionAPI) => void
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
  const filtradas = conversaciones.filter((c) =>
    c.patientName.toLowerCase().includes(busqueda.toLowerCase()) ||
    (c.patientPhone ?? "").includes(busqueda)
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
          filtradas.map((conv) => {
            const ultimo = conv.messages[0]
            return (
              <motion.button
                key={conv.id}
                className={`w-full p-4 flex items-start gap-3 hover:bg-muted/50 transition-colors text-left ${
                  activaId === conv.id ? "bg-primary/5 border-l-2 border-primary" : ""
                }`}
                onClick={() => onSeleccionar(conv)}
                whileHover={{ x: 2 }}
              >
                <AvatarUsuario nombre={conv.patientName} tamaño="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-foreground truncate">{conv.patientName}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {formatearHoraRelativa(conv.updatedAt)}
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
