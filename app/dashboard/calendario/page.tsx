"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { BarraSuperior } from "@/components/eli/app/barra-superior"
import { TarjetaCita, type Cita } from "@/components/eli/app/tarjeta-cita"
import { BotonPrimario } from "@/components/eli/app/boton-primario"
import { AvatarUsuario } from "@/components/eli/app/avatar-usuario"
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  List,
  Grid3X3,
} from "lucide-react"

// Datos de ejemplo
const citasDelDia: Cita[] = [
  { id: "1", pacienteNombre: "María García", servicio: "Corte + Tinte", horaInicio: "09:00", horaFin: "10:30", duracion: 90, estado: "confirmada" },
  { id: "2", pacienteNombre: "Carlos Rodríguez", servicio: "Corte de cabello", horaInicio: "10:30", horaFin: "11:00", duracion: 30, estado: "en-progreso" },
  { id: "3", pacienteNombre: "Ana Pérez", servicio: "Manicure + Pedicure", horaInicio: "11:30", horaFin: "13:00", duracion: 90, estado: "pendiente" },
  { id: "4", pacienteNombre: "Luis Martínez", servicio: "Consulta nutrición", horaInicio: "14:00", horaFin: "14:45", duracion: 45, estado: "confirmada" },
  { id: "5", pacienteNombre: "Sofia Hernández", servicio: "Masaje relajante", horaInicio: "15:00", horaFin: "16:00", duracion: 60, estado: "confirmada" },
  { id: "6", pacienteNombre: "Pedro López", servicio: "Corte de cabello", horaInicio: "16:30", horaFin: "17:00", duracion: 30, estado: "pendiente" },
]

const horasDelDia = Array.from({ length: 12 }, (_, i) => {
  const hora = i + 8
  return `${hora.toString().padStart(2, "0")}:00`
})

const diasSemana = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

type VistaCalendario = "dia" | "semana" | "mes"

export default function CalendarioPage() {
  const [fechaActual, setFechaActual] = useState(new Date())
  const [vista, setVista] = useState<VistaCalendario>("semana")
  const [citaSeleccionada, setCitaSeleccionada] = useState<Cita | null>(null)

  const irAnterior = () => {
    const nuevaFecha = new Date(fechaActual)
    if (vista === "dia") nuevaFecha.setDate(nuevaFecha.getDate() - 1)
    else if (vista === "semana") nuevaFecha.setDate(nuevaFecha.getDate() - 7)
    else nuevaFecha.setMonth(nuevaFecha.getMonth() - 1)
    setFechaActual(nuevaFecha)
  }

  const irSiguiente = () => {
    const nuevaFecha = new Date(fechaActual)
    if (vista === "dia") nuevaFecha.setDate(nuevaFecha.getDate() + 1)
    else if (vista === "semana") nuevaFecha.setDate(nuevaFecha.getDate() + 7)
    else nuevaFecha.setMonth(nuevaFecha.getMonth() + 1)
    setFechaActual(nuevaFecha)
  }

  const irHoy = () => setFechaActual(new Date())

  const obtenerDiasSemana = () => {
    const inicioSemana = new Date(fechaActual)
    const diaSemana = inicioSemana.getDay()
    inicioSemana.setDate(inicioSemana.getDate() - diaSemana)
    
    return Array.from({ length: 7 }, (_, i) => {
      const dia = new Date(inicioSemana)
      dia.setDate(dia.getDate() + i)
      return dia
    })
  }

  const formatoFecha = () => {
    if (vista === "dia") {
      return fechaActual.toLocaleDateString("es-ES", { 
        weekday: "long", 
        day: "numeric", 
        month: "long" 
      })
    }
    return `${meses[fechaActual.getMonth()]} ${fechaActual.getFullYear()}`
  }

  const esHoy = (fecha: Date) => {
    const hoy = new Date()
    return fecha.toDateString() === hoy.toDateString()
  }

  return (
    <div className="min-h-screen">
      <BarraSuperior
        titulo="Calendario"
        subtitulo="Gestiona tus citas y disponibilidad"
        accionPrincipal={{
          texto: "Nueva cita",
          onClick: () => {},
        }}
      />

      <div className="p-6">
        {/* Controles del calendario */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-card border border-border/50 rounded-lg">
              <button
                onClick={irAnterior}
                className="p-2 hover:bg-muted transition-colors rounded-l-lg"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={irHoy}
                className="px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
              >
                Hoy
              </button>
              <button
                onClick={irSiguiente}
                className="p-2 hover:bg-muted transition-colors rounded-r-lg"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
            <h2 className="text-lg font-semibold text-foreground capitalize">
              {formatoFecha()}
            </h2>
          </div>

          <div className="flex items-center gap-2 bg-card border border-border/50 rounded-lg p-1">
            {[
              { id: "dia" as const, label: "Día", icono: Calendar },
              { id: "semana" as const, label: "Semana", icono: List },
              { id: "mes" as const, label: "Mes", icono: Grid3X3 },
            ].map((opcion) => (
              <button
                key={opcion.id}
                onClick={() => setVista(opcion.id)}
                className={`
                  flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all
                  ${vista === opcion.id 
                    ? "bg-primary text-primary-foreground" 
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }
                `}
              >
                <opcion.icono className="h-4 w-4" />
                <span className="hidden sm:inline">{opcion.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-6">
          {/* Calendario principal */}
          <div className="flex-1 bg-card border border-border/50 rounded-xl overflow-hidden">
            {vista === "semana" && (
              <div className="min-h-[600px]">
                {/* Header con dias */}
                <div className="grid grid-cols-8 border-b border-border/50">
                  <div className="p-3 text-xs font-medium text-muted-foreground" />
                  {obtenerDiasSemana().map((dia, i) => (
                    <div
                      key={i}
                      className={`p-3 text-center border-l border-border/50 ${esHoy(dia) ? "bg-primary/5" : ""}`}
                    >
                      <p className="text-xs font-medium text-muted-foreground">
                        {diasSemana[dia.getDay()]}
                      </p>
                      <p className={`text-lg font-semibold mt-1 ${
                        esHoy(dia) 
                          ? "bg-primary text-primary-foreground w-8 h-8 rounded-full flex items-center justify-center mx-auto" 
                          : "text-foreground"
                      }`}>
                        {dia.getDate()}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Grilla de horas */}
                <div className="relative">
                  {horasDelDia.map((hora, i) => (
                    <div key={hora} className="grid grid-cols-8 border-b border-border/30">
                      <div className="p-2 text-xs text-muted-foreground text-right pr-3">
                        {hora}
                      </div>
                      {obtenerDiasSemana().map((dia, j) => (
                        <div
                          key={j}
                          className={`h-16 border-l border-border/30 hover:bg-muted/30 transition-colors cursor-pointer ${
                            esHoy(dia) ? "bg-primary/5" : ""
                          }`}
                        />
                      ))}
                    </div>
                  ))}

                  {/* Citas superpuestas (simplificado para el dia actual) */}
                  <div className="absolute top-0 left-[calc(12.5%+12.5%*4)] w-[calc(12.5%-1px)] px-1">
                    {citasDelDia.slice(0, 3).map((cita, i) => {
                      const [horaStr] = cita.horaInicio.split(":")
                      const hora = parseInt(horaStr)
                      const top = (hora - 8) * 64 + 8
                      const height = (cita.duracion / 60) * 64 - 8

                      return (
                        <motion.div
                          key={cita.id}
                          className={`absolute left-1 right-1 rounded-lg p-2 cursor-pointer overflow-hidden ${
                            cita.estado === "confirmada" ? "bg-green-100 border-l-2 border-green-500" :
                            cita.estado === "en-progreso" ? "bg-blue-100 border-l-2 border-blue-500" :
                            "bg-amber-100 border-l-2 border-amber-500"
                          }`}
                          style={{ top, height: Math.max(height, 40) }}
                          whileHover={{ scale: 1.02, zIndex: 10 }}
                          onClick={() => setCitaSeleccionada(cita)}
                        >
                          <p className="text-xs font-medium text-foreground truncate">
                            {cita.pacienteNombre}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {cita.servicio}
                          </p>
                        </motion.div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {vista === "dia" && (
              <div className="p-4 space-y-3">
                {horasDelDia.map((hora) => {
                  const citaEnHora = citasDelDia.find(c => c.horaInicio.startsWith(hora.slice(0, 2)))
                  return (
                    <div key={hora} className="flex gap-4">
                      <span className="text-sm text-muted-foreground w-16 flex-shrink-0 pt-2">{hora}</span>
                      {citaEnHora ? (
                        <div className="flex-1">
                          <TarjetaCita cita={citaEnHora} compacta onClick={() => setCitaSeleccionada(citaEnHora)} />
                        </div>
                      ) : (
                        <div className="flex-1 h-12 border border-dashed border-border/50 rounded-lg hover:bg-muted/30 cursor-pointer transition-colors" />
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {vista === "mes" && (
              <div className="p-4">
                {/* Header dias */}
                <div className="grid grid-cols-7 mb-2">
                  {diasSemana.map((dia) => (
                    <div key={dia} className="p-2 text-center text-sm font-medium text-muted-foreground">
                      {dia}
                    </div>
                  ))}
                </div>
                {/* Dias del mes */}
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 35 }, (_, i) => {
                    const primerDia = new Date(fechaActual.getFullYear(), fechaActual.getMonth(), 1)
                    const offset = primerDia.getDay()
                    const diaNum = i - offset + 1
                    const fecha = new Date(fechaActual.getFullYear(), fechaActual.getMonth(), diaNum)
                    const esDelMes = fecha.getMonth() === fechaActual.getMonth()
                    const tieneCitas = esDelMes && diaNum > 0 && diaNum % 3 === 0

                    return (
                      <motion.div
                        key={i}
                        className={`
                          aspect-square p-2 rounded-lg cursor-pointer transition-colors
                          ${esDelMes ? "hover:bg-muted" : "opacity-30"}
                          ${esHoy(fecha) ? "bg-primary/10 ring-2 ring-primary" : ""}
                        `}
                        whileHover={{ scale: 1.05 }}
                      >
                        <span className={`text-sm ${esDelMes ? "text-foreground" : "text-muted-foreground"}`}>
                          {diaNum > 0 && diaNum <= 31 ? diaNum : ""}
                        </span>
                        {tieneCitas && (
                          <div className="flex gap-0.5 mt-1">
                            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                          </div>
                        )}
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Panel lateral - Detalle de cita */}
          <AnimatePresence>
            {citaSeleccionada && (
              <motion.div
                className="w-80 bg-card border border-border/50 rounded-xl p-5 hidden lg:block"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-foreground">Detalle de cita</h3>
                  <button
                    onClick={() => setCitaSeleccionada(null)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    ×
                  </button>
                </div>

                <div className="flex items-center gap-3 mb-6">
                  <AvatarUsuario nombre={citaSeleccionada.pacienteNombre} tamaño="lg" />
                  <div>
                    <p className="font-semibold text-foreground">{citaSeleccionada.pacienteNombre}</p>
                    <p className="text-sm text-muted-foreground">{citaSeleccionada.servicio}</p>
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  <div className="flex justify-between py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">Horario</span>
                    <span className="text-sm font-medium">{citaSeleccionada.horaInicio} - {citaSeleccionada.horaFin}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">Duración</span>
                    <span className="text-sm font-medium">{citaSeleccionada.duracion} minutos</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border/50">
                    <span className="text-sm text-muted-foreground">Estado</span>
                    <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${
                      citaSeleccionada.estado === "confirmada" ? "bg-green-100 text-green-700" :
                      citaSeleccionada.estado === "en-progreso" ? "bg-blue-100 text-blue-700" :
                      "bg-amber-100 text-amber-700"
                    }`}>
                      {citaSeleccionada.estado}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <BotonPrimario anchoCompleto tamaño="sm">
                    Editar cita
                  </BotonPrimario>
                  <BotonPrimario variante="secundario" anchoCompleto tamaño="sm">
                    Enviar recordatorio
                  </BotonPrimario>
                  <BotonPrimario variante="peligro" anchoCompleto tamaño="sm">
                    Cancelar cita
                  </BotonPrimario>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
