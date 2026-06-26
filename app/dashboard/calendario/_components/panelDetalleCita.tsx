"use client"

import { motion } from "framer-motion"
import { X } from "lucide-react"
import { AvatarUsuario } from "@/components/app/comunes/avatar-usuario"
import { BotonPrimario } from "@/components/app/formularios/boton-primario"

export interface CitaAPI {
  id: string
  title: string
  startTime: string
  endTime: string
  status: string
  isWalkIn: boolean
  notes: string | null
  price: number | null
  patientId: string
  patient: {
    id: string
    name: string
    email: string | null
    phone: string | null
  }
}

const etiquetasEstado: Record<string, { texto: string; color: string }> = {
  pendiente: { texto: "Pendiente", color: "bg-amber-100 text-amber-700" },
  confirmada: { texto: "Confirmada", color: "bg-green-100 text-green-700" },
  "en-progreso": { texto: "En progreso", color: "bg-blue-100 text-blue-700" },
  completada: { texto: "Completada", color: "bg-gray-100 text-gray-600" },
  cancelada: { texto: "Cancelada", color: "bg-red-100 text-red-700" },
}

function formatFechaHora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false })
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })
}

function duracionMin(start: string, end: string) {
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000))
}

interface PanelDetalleCitaProps {
  cita: CitaAPI
  onCerrar: () => void
  onCambiarEstado: (id: string, status: string) => void
}

export function PanelDetalleCita({ cita, onCerrar, onCambiarEstado }: PanelDetalleCitaProps) {
  const etiqueta = etiquetasEstado[cita.status] ?? etiquetasEstado.pendiente
  const duracion = duracionMin(cita.startTime, cita.endTime)

  return (
    <motion.div
      className="w-80 bg-card border border-border/50 rounded-xl p-5 hidden lg:flex lg:flex-col flex-shrink-0"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">Detalle de cita</h3>
        <button
          onClick={onCerrar}
          className="p-1 rounded-lg hover:bg-muted transition-colors"
        >
          <X className="h-5 w-5 text-muted-foreground" />
        </button>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <AvatarUsuario nombre={cita.patient.name} tamaño="lg" />
        <div>
          <p className="font-semibold text-foreground">{cita.patient.name}</p>
          <p className="text-sm text-muted-foreground">{cita.title}</p>
        </div>
      </div>

      <div className="space-y-0 mb-6 divide-y divide-border/50">
        <div className="flex justify-between py-2.5">
          <span className="text-sm text-muted-foreground">Fecha</span>
          <span className="text-sm font-medium capitalize">{formatFecha(cita.startTime)}</span>
        </div>
        <div className="flex justify-between py-2.5">
          <span className="text-sm text-muted-foreground">Horario</span>
          <span className="text-sm font-medium">
            {formatFechaHora(cita.startTime)} – {formatFechaHora(cita.endTime)}
          </span>
        </div>
        <div className="flex justify-between py-2.5">
          <span className="text-sm text-muted-foreground">Duración</span>
          <span className="text-sm font-medium">{duracion} minutos</span>
        </div>
        {cita.price != null && (
          <div className="flex justify-between py-2.5">
            <span className="text-sm text-muted-foreground">Precio</span>
            <span className="text-sm font-medium">${cita.price.toLocaleString("es-ES")}</span>
          </div>
        )}
        <div className="flex justify-between items-center py-2.5">
          <span className="text-sm text-muted-foreground">Estado</span>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${etiqueta.color}`}>
              {etiqueta.texto}
            </span>
            {cita.isWalkIn && (
              <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                Walk-in
              </span>
            )}
          </div>
        </div>
      </div>

      {cita.notes && (
        <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 mb-4">
          {cita.notes}
        </p>
      )}

      <div className="space-y-2 mt-auto">
        {cita.status !== "completada" && cita.status !== "cancelada" && (
          <BotonPrimario
            anchoCompleto
            tamaño="sm"
            onClick={() => onCambiarEstado(cita.id, "completada")}
          >
            Marcar completada
          </BotonPrimario>
        )}
        {cita.status !== "cancelada" && (
          <BotonPrimario
            variante="peligro"
            anchoCompleto
            tamaño="sm"
            onClick={() => onCambiarEstado(cita.id, "cancelada")}
          >
            Cancelar cita
          </BotonPrimario>
        )}
      </div>
    </motion.div>
  )
}
