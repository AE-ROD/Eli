"use client"

import { motion } from "framer-motion"
import { AvatarUsuario } from "@/components/panel/avatar-usuario"
import { MoreHorizontal, Phone, Mail, Calendar } from "lucide-react"

export interface Cliente {
  id: string
  nombre: string
  email: string
  telefono: string
  imagenUrl?: string
  visitas: number
  ultimaVisita: string
  etiqueta?: "VIP" | "Frecuente" | "Nuevo" | "Inactivo"
}

interface TarjetaClienteProps {
  cliente: Cliente
  onClick?: () => void
}

const coloresEtiqueta = {
  VIP: "bg-amber-100 text-amber-700",
  Frecuente: "bg-green-100 text-green-700",
  Nuevo: "bg-blue-100 text-blue-700",
  Inactivo: "bg-gray-100 text-gray-600",
}

export function TarjetaCliente({ cliente, onClick }: TarjetaClienteProps) {
  return (
    <motion.div
      className="bg-card border border-border/50 rounded-xl p-4 hover:shadow-md transition-all cursor-pointer"
      whileHover={{ y: -2 }}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <AvatarUsuario nombre={cliente.nombre} imagenUrl={cliente.imagenUrl} tamaño="lg" />
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-foreground">{cliente.nombre}</h4>
              {cliente.etiqueta && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${coloresEtiqueta[cliente.etiqueta]}`}>
                  {cliente.etiqueta}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Mail className="h-3 w-3" />
                {cliente.email}
              </span>
            </div>
          </div>
        </div>
        <button className="p-1 rounded-lg hover:bg-muted transition-colors">
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
      
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-border/50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Phone className="h-3 w-3" />
            {cliente.telefono}
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {cliente.visitas} visitas
          </div>
        </div>
        <span className="text-xs text-muted-foreground">
          Última: {cliente.ultimaVisita}
        </span>
      </div>
    </motion.div>
  )
}
