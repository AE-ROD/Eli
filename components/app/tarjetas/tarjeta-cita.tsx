"use client"

import { motion } from "framer-motion"
import { AvatarUsuario } from "@/components/app/comunes/avatar-usuario"
import { Clock, MapPin, MoreVertical } from "lucide-react"

export interface Cita {
  id: string
  pacienteNombre: string
  pacienteImagen?: string
  servicio: string
  horaInicio: string
  horaFin: string
  duracion: number // en minutos
  estado: "pendiente" | "confirmada" | "en-progreso" | "completada" | "cancelada"
  notas?: string
}

interface TarjetaCitaProps {
  cita: Cita
  compacta?: boolean
  onClick?: () => void
}

const coloresEstado = {
  pendiente: "border-l-amber-500 bg-amber-50",
  confirmada: "border-l-green-500 bg-green-50",
  "en-progreso": "border-l-blue-500 bg-blue-50",
  completada: "border-l-gray-400 bg-gray-50",
  cancelada: "border-l-red-500 bg-red-50",
}

const etiquetasEstado = {
  pendiente: { texto: "Pendiente", color: "bg-amber-100 text-amber-700" },
  confirmada: { texto: "Confirmada", color: "bg-green-100 text-green-700" },
  "en-progreso": { texto: "En progreso", color: "bg-blue-100 text-blue-700" },
  completada: { texto: "Completada", color: "bg-gray-100 text-gray-600" },
  cancelada: { texto: "Cancelada", color: "bg-red-100 text-red-700" },
}

export function TarjetaCita({ cita, compacta = false, onClick }: TarjetaCitaProps) {
  if (compacta) {
    return (
      <motion.div
        className={`border-l-4 rounded-r-lg p-3 cursor-pointer ${coloresEstado[cita.estado]}`}
        whileHover={{ x: 2 }}
        onClick={onClick}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AvatarUsuario nombre={cita.pacienteNombre} tamaño="sm" />
            <div>
              <p className="text-sm font-medium text-foreground">{cita.pacienteNombre}</p>
              <p className="text-xs text-muted-foreground">{cita.servicio}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-foreground">{cita.horaInicio}</p>
            <p className="text-xs text-muted-foreground">{cita.duracion} min</p>
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      className={`border-l-4 rounded-xl p-4 cursor-pointer bg-card border border-border/50 ${coloresEstado[cita.estado].split(" ")[0]}`}
      whileHover={{ y: -2, boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <AvatarUsuario nombre={cita.pacienteNombre} imagenUrl={cita.pacienteImagen} tamaño="md" />
          <div>
            <h4 className="font-semibold text-foreground">{cita.pacienteNombre}</h4>
            <p className="text-sm text-muted-foreground">{cita.servicio}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${etiquetasEstado[cita.estado].color}`}>
            {etiquetasEstado[cita.estado].texto}
          </span>
          <button className="p-1 rounded-lg hover:bg-muted transition-colors">
            <MoreVertical className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border/50">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          {cita.horaInicio} - {cita.horaFin}
        </div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" />
          {cita.duracion} minutos
        </div>
      </div>

      {cita.notas && (
        <p className="mt-3 text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
          {cita.notas}
        </p>
      )}
    </motion.div>
  )
}
