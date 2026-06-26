"use client"

import { motion } from "framer-motion"
import { AvatarUsuario } from "@/components/app/comunes/avatar-usuario"
import { MoreHorizontal, Phone, Mail, Calendar } from "lucide-react"

export interface Paciente {
  id: string
  nombre: string
  email: string
  telefono: string
  imagenUrl?: string
  visitas: number
  ultimaVisita: string
  etiqueta?: "VIP" | "Frecuente" | "Nuevo" | "Inactivo"
}

interface TarjetaPacienteProps {
  paciente: Paciente
  onClick?: () => void
}

const coloresEtiqueta = {
  VIP: "bg-amber-100 text-amber-700",
  Frecuente: "bg-green-100 text-green-700",
  Nuevo: "bg-blue-100 text-blue-700",
  Inactivo: "bg-gray-100 text-gray-600",
}

export function TarjetaPaciente({ paciente, onClick }: TarjetaPacienteProps) {
  return (
    <motion.div
      className="bg-card border border-border/50 rounded-xl p-4 hover:shadow-md transition-all cursor-pointer"
      whileHover={{ y: -2 }}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex items-center gap-3">
          <AvatarUsuario nombre={paciente.nombre} imagenUrl={paciente.imagenUrl} tamaño="lg" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="truncate font-semibold text-foreground">{paciente.nombre}</h4>
              {paciente.etiqueta && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${coloresEtiqueta[paciente.etiqueta]}`}>
                  {paciente.etiqueta}
                </span>
              )}
            </div>
            <div className="mt-1 min-w-0">
              <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                <Mail className="h-3 w-3" />
                <span className="truncate">{paciente.email}</span>
              </span>
            </div>
          </div>
        </div>
        <button className="p-1 rounded-lg hover:bg-muted transition-colors">
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
      
      <div className="mt-4 flex flex-col gap-2 border-t border-border/50 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <Phone className="h-3 w-3" />
            <span className="truncate">{paciente.telefono}</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {paciente.visitas} visitas
          </div>
        </div>
        <span className="text-xs text-muted-foreground">
          Última: {paciente.ultimaVisita}
        </span>
      </div>
    </motion.div>
  )
}
