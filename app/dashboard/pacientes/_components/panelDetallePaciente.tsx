"use client"

import { motion } from "framer-motion"
import { AvatarUsuario } from "@/components/app/comunes/avatar-usuario"
import { BotonPrimario } from "@/components/app/formularios/boton-primario"
import { TarjetaCita, type Cita } from "@/components/app/tarjetas/tarjeta-cita"
import { X, Mail, Phone, Calendar, Clock, FileText, Tag } from "lucide-react"
import type { Paciente } from "@/components/app/tarjetas/tarjeta-paciente"

export interface CitaPacienteAPI {
  id: string
  title: string
  startTime: string
  endTime: string
  status: string
  price: number | null
}

export interface PacienteAPICompleto {
  id: string
  name: string
  email: string | null
  phone: string | null
  tags: string[]
  notes: string | null
  createdAt: string
  appointments: CitaPacienteAPI[]
}

const coloresEtiqueta: Record<string, string> = {
  VIP: "bg-amber-100 text-amber-700",
  Frecuente: "bg-green-100 text-green-700",
  Nuevo: "bg-blue-100 text-blue-700",
  Inactivo: "bg-gray-100 text-gray-600",
}

function formatHora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

function duracionMin(start: string, end: string) {
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000))
}

function mapearCitaParaTarjeta(cita: CitaPacienteAPI, nombrePaciente: string): Cita {
  const estadosValidos = ["pendiente", "confirmada", "en-progreso", "completada", "cancelada"] as const
  const estado = estadosValidos.includes(cita.status as (typeof estadosValidos)[number])
    ? (cita.status as Cita["estado"])
    : "pendiente"
  return {
    id: cita.id,
    pacienteNombre: nombrePaciente,
    servicio: cita.title,
    horaInicio: formatHora(cita.startTime),
    horaFin: formatHora(cita.endTime ?? cita.startTime),
    duracion: duracionMin(cita.startTime, cita.endTime ?? cita.startTime),
    estado,
  }
}

interface PanelDetallePacienteProps {
  paciente: Paciente
  raw: PacienteAPICompleto | null
  notas: string
  guardandoNotas: boolean
  onCerrar: () => void
  onNotasChange: (v: string) => void
  onNotasBlur: () => void
}

export function PanelDetallePaciente({
  paciente,
  raw,
  notas,
  guardandoNotas,
  onCerrar,
  onNotasChange,
  onNotasBlur,
}: PanelDetallePacienteProps) {
  return (
    <motion.aside
      className="w-96 bg-card border border-border/50 rounded-xl overflow-hidden hidden lg:flex lg:flex-col flex-shrink-0"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
    >
      {/* Cabecera con avatar */}
      <div className="relative bg-primary/5 p-6 pb-16 flex-shrink-0">
        <button
          onClick={onCerrar}
          className="absolute top-4 right-4 p-1 rounded-lg hover:bg-background/50 transition-colors"
        >
          <X className="h-5 w-5 text-muted-foreground" />
        </button>
        <div className="absolute -bottom-10 left-6">
          <AvatarUsuario nombre={paciente.nombre} tamaño="xl" />
        </div>
      </div>

      {/* Contenido scrolleable */}
      <div className="p-6 pt-14 overflow-y-auto flex-1">
        {/* Nombre y etiqueta */}
        <div className="mb-4">
          <h3 className="text-xl font-bold text-foreground">{paciente.nombre}</h3>
          {paciente.etiqueta && (
            <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${coloresEtiqueta[paciente.etiqueta] ?? ""}`}>
              {paciente.etiqueta}
            </span>
          )}
        </div>

        {/* Datos de contacto */}
        <div className="space-y-3 mb-6">
          <div className="flex items-center gap-3 text-sm">
            <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-foreground truncate">{paciente.email}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-foreground">{paciente.telefono}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-foreground">{paciente.visitas} visitas registradas</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-muted-foreground">Última visita: {paciente.ultimaVisita}</span>
          </div>
        </div>

        {/* Acciones */}
        <div className="grid grid-cols-2 gap-2 mb-6">
          <BotonPrimario tamaño="sm" anchoCompleto>Agendar cita</BotonPrimario>
          <BotonPrimario variante="secundario" tamaño="sm" anchoCompleto>Enviar mensaje</BotonPrimario>
        </div>

        {/* Historial usando TarjetaCita compacta */}
        <div>
          <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Historial de citas
          </h4>
          {raw && raw.appointments.length > 0 ? (
            <div className="space-y-2">
              {raw.appointments.map((cita) => (
                <div key={cita.id}>
                  <TarjetaCita
                    cita={mapearCitaParaTarjeta(cita, paciente.nombre)}
                    compacta
                  />
                  {cita.price != null && (
                    <p className="text-xs text-right text-muted-foreground mt-0.5 pr-1">
                      ${cita.price.toLocaleString("es-ES")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin citas registradas</p>
          )}
        </div>

        {/* Notas */}
        <div className="mt-6">
          <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Notas
          </h4>
          <textarea
            value={notas}
            onChange={(e) => onNotasChange(e.target.value)}
            onBlur={onNotasBlur}
            placeholder="Agregar notas sobre el paciente..."
            className="w-full p-3 rounded-lg border border-border bg-background text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {guardandoNotas && (
            <p className="text-xs text-muted-foreground mt-1">Guardando...</p>
          )}
        </div>
      </div>
    </motion.aside>
  )
}
