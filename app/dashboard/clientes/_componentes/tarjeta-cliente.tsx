"use client"

import { motion } from "framer-motion"
import { AvatarUsuario } from "@/components/panel/avatar-usuario"
import { MoreHorizontal, Phone, Mail, Calendar } from "lucide-react"
import type { Cliente } from "../_datos"

/**
 * Un cliente tal como lo dibuja la tarjeta: ya con los textos de pantalla
 * resueltos. No es el `Cliente` del servidor; se arma con `clienteParaTarjeta`.
 */
export interface ClienteEnTarjeta {
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
  cliente: ClienteEnTarjeta
  onClick?: () => void
}

const coloresEtiqueta = {
  VIP: "bg-amber-100 text-amber-700",
  Frecuente: "bg-green-100 text-green-700",
  Nuevo: "bg-blue-100 text-blue-700",
  Inactivo: "bg-gray-100 text-gray-600",
}

const ETIQUETAS_VALIDAS = ["VIP", "Frecuente", "Nuevo", "Inactivo"] as const

/** `Hoy`, `Ayer`, `Hace 3 días`, `Hace 2 semanas`, `Hace 4 meses`. */
function formatearFechaRelativa(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (dias === 0) return "Hoy"
  if (dias === 1) return "Ayer"
  if (dias < 7) return `Hace ${dias} días`
  if (dias < 14) return "Hace 1 semana"
  if (dias < 30) return `Hace ${Math.floor(dias / 7)} semanas`
  if (dias < 60) return "Hace 1 mes"
  return `Hace ${Math.floor(dias / 30)} meses`
}

/**
 * Del cliente que devuelve el servidor a lo que muestra la tarjeta. Las citas
 * vienen de la más reciente a la más vieja, así que la primera es la última
 * visita. De las etiquetas, se muestra la primera que la tarjeta sabe pintar.
 */
export function clienteParaTarjeta(cliente: Cliente): ClienteEnTarjeta {
  const etiqueta = cliente.tags.find((etiquetaDelCliente) =>
    (ETIQUETAS_VALIDAS as readonly string[]).includes(etiquetaDelCliente)
  ) as ClienteEnTarjeta["etiqueta"]
  const ultimaCita = cliente.appointments[0]
  return {
    id: cliente.id,
    nombre: cliente.name,
    email: cliente.email ?? "Sin email",
    telefono: cliente.phone ?? "Sin teléfono",
    visitas: cliente.appointments.length,
    ultimaVisita: ultimaCita ? formatearFechaRelativa(ultimaCita.startTime) : "Sin visitas",
    etiqueta,
  }
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
