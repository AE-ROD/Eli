"use client"

import { motion } from "framer-motion"
import { AvatarUsuario } from "@/components/panel/avatar-usuario"
import { BotonPrimario } from "@/components/comunes/boton-primario"
import { TarjetaCita, type CitaEnTarjeta } from "@/components/panel/tarjeta-cita"
import { formatearMonto } from "@/lib/dinero"
import { formatearHora, duracionParaMostrar } from "@/lib/fechas"
import { X, Mail, Phone, Calendar, Clock, FileText, Tag } from "lucide-react"
import type { ClienteEnTarjeta } from "./tarjeta-cliente"
import type { CitaDeCliente } from "../_datos"

const coloresEtiqueta: Record<string, string> = {
  VIP: "bg-amber-100 text-amber-700",
  Frecuente: "bg-green-100 text-green-700",
  Nuevo: "bg-blue-100 text-blue-700",
  Inactivo: "bg-gray-100 text-gray-600",
}

function mapearCitaParaTarjeta(cita: CitaDeCliente, nombreCliente: string): CitaEnTarjeta {
  const estadosValidos = ["pendiente", "confirmada", "en-progreso", "completada", "cancelada"] as const
  const estado = estadosValidos.includes(cita.status as (typeof estadosValidos)[number])
    ? (cita.status as CitaEnTarjeta["estado"])
    : "pendiente"
  return {
    id: cita.id,
    nombreCliente,
    servicio: cita.title,
    horaInicio: formatearHora(cita.startTime),
    horaFin: formatearHora(cita.endTime ?? cita.startTime),
    duracion: duracionParaMostrar(cita.startTime, cita.endTime ?? cita.startTime),
    estado,
  }
}

interface PanelDetalleClienteProps {
  cliente: ClienteEnTarjeta
  /** Sus últimas citas, de la más reciente a la más vieja. */
  citas: CitaDeCliente[]
  notas: string
  guardandoNotas: boolean
  /**
   * Por qué no se guardaron las notas, si falló. Se muestra bajo el campo: el
   * guardado sale de su blur, y un aviso arriba de la página quedaría fuera de
   * la vista.
   */
  avisoDeNotas: string
  onCerrar: () => void
  onNotasChange: (notas: string) => void
  onNotasBlur: () => void
}

export function PanelDetalleCliente({
  cliente,
  citas,
  notas,
  guardandoNotas,
  avisoDeNotas,
  onCerrar,
  onNotasChange,
  onNotasBlur,
}: PanelDetalleClienteProps) {
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
          <AvatarUsuario nombre={cliente.nombre} tamaño="xl" />
        </div>
      </div>

      {/* Contenido scrolleable */}
      <div className="p-6 pt-14 overflow-y-auto flex-1">
        {/* Nombre y etiqueta */}
        <div className="mb-4">
          <h3 className="text-xl font-bold text-foreground">{cliente.nombre}</h3>
          {cliente.etiqueta && (
            <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${coloresEtiqueta[cliente.etiqueta] ?? ""}`}>
              {cliente.etiqueta}
            </span>
          )}
        </div>

        {/* Datos de contacto */}
        <div className="space-y-3 mb-6">
          <div className="flex items-center gap-3 text-sm">
            <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-foreground truncate">{cliente.email}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-foreground">{cliente.telefono}</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-foreground">{cliente.visitas} visitas registradas</span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-muted-foreground">Última visita: {cliente.ultimaVisita}</span>
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
          {citas.length > 0 ? (
            <div className="space-y-2">
              {citas.map((cita) => (
                <div key={cita.id}>
                  <TarjetaCita
                    cita={mapearCitaParaTarjeta(cita, cliente.nombre)}
                    compacta
                  />
                  {cita.price != null && (
                    <p className="text-xs text-right text-muted-foreground mt-0.5 pr-1">
                      {formatearMonto(cita.price)}
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
            placeholder="Agregar notas sobre el cliente..."
            className="w-full p-3 rounded-lg border border-border bg-background text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {guardandoNotas && (
            <p className="text-xs text-muted-foreground mt-1">Guardando...</p>
          )}
          {avisoDeNotas && (
            <p role="alert" className="text-sm text-red-500 mt-1.5">
              {avisoDeNotas}
            </p>
          )}
        </div>
      </div>
    </motion.aside>
  )
}
