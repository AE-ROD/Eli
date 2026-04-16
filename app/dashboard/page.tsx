"use client"

import { motion } from "framer-motion"
import { BarraSuperior } from "@/components/eli/app/barra-superior"
import { TarjetaEstadistica } from "@/components/eli/app/tarjeta-estadistica"
import { TarjetaCita } from "@/components/eli/app/tarjeta-cita"
import { AvatarUsuario } from "@/components/eli/app/avatar-usuario"
import {
  CalendarDays,
  Users,
  DollarSign,
  TrendingUp,
  Clock,
  ArrowRight,
} from "lucide-react"
import Link from "next/link"

// Datos de ejemplo
const estadisticasHoy = [
  { titulo: "Citas hoy", valor: 8, icono: CalendarDays, colorIcono: "primario" as const, tendencia: { valor: 12, esPositiva: true } },
  { titulo: "Clientes activos", valor: 156, icono: Users, colorIcono: "exito" as const, tendencia: { valor: 8, esPositiva: true } },
  { titulo: "Ingresos del mes", valor: "$4,250", icono: DollarSign, colorIcono: "info" as const, tendencia: { valor: 15, esPositiva: true } },
  { titulo: "Tasa ocupación", valor: "78%", icono: TrendingUp, colorIcono: "advertencia" as const, tendencia: { valor: 5, esPositiva: true } },
]

const citasProximas = [
  { id: "1", pacienteNombre: "María García", servicio: "Corte + Tinte", horaInicio: "09:00", horaFin: "10:30", duracion: 90, estado: "confirmada" as const },
  { id: "2", pacienteNombre: "Carlos Rodríguez", servicio: "Corte de cabello", horaInicio: "10:30", horaFin: "11:00", duracion: 30, estado: "en-progreso" as const },
  { id: "3", pacienteNombre: "Ana Pérez", servicio: "Manicure", horaInicio: "11:30", horaFin: "12:30", duracion: 60, estado: "pendiente" as const },
  { id: "4", pacienteNombre: "Luis Martínez", servicio: "Consulta general", horaInicio: "14:00", horaFin: "14:30", duracion: 30, estado: "confirmada" as const },
]

const clientesRecientes = [
  { nombre: "María García", ultimaVisita: "Hoy", servicios: 12 },
  { nombre: "Carlos Rodríguez", ultimaVisita: "Hace 2 días", servicios: 5 },
  { nombre: "Ana Pérez", ultimaVisita: "Hace 1 semana", servicios: 8 },
  { nombre: "Luis Martínez", ultimaVisita: "Hace 3 días", servicios: 3 },
]

const contenedorVariantes = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
}

const itemVariantes = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
}

export default function DashboardPage() {
  const fechaActual = new Date().toLocaleDateString("es-ES", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return (
    <div className="min-h-screen">
      <BarraSuperior
        titulo="Dashboard"
        subtitulo={fechaActual.charAt(0).toUpperCase() + fechaActual.slice(1)}
        accionPrincipal={{
          texto: "Nueva cita",
          onClick: () => {},
        }}
      />

      <div className="p-6 space-y-8">
        {/* Estadisticas */}
        <motion.section
          variants={contenedorVariantes}
          initial="hidden"
          animate="show"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {estadisticasHoy.map((stat) => (
              <motion.div key={stat.titulo} variants={itemVariantes}>
                <TarjetaEstadistica
                  titulo={stat.titulo}
                  valor={stat.valor}
                  icono={stat.icono}
                  colorIcono={stat.colorIcono}
                  tendencia={stat.tendencia}
                />
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Contenido principal */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Citas del dia */}
          <motion.section
            className="lg:col-span-2"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="bg-card border border-border/50 rounded-xl">
              <div className="flex items-center justify-between p-5 border-b border-border/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-foreground">Citas de hoy</h2>
                    <p className="text-sm text-muted-foreground">{citasProximas.length} citas programadas</p>
                  </div>
                </div>
                <Link
                  href="/dashboard/calendario"
                  className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  Ver calendario
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="p-5 space-y-3">
                {citasProximas.map((cita) => (
                  <TarjetaCita key={cita.id} cita={cita} compacta />
                ))}
              </div>
            </div>
          </motion.section>

          {/* Clientes recientes */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="bg-card border border-border/50 rounded-xl">
              <div className="flex items-center justify-between p-5 border-b border-border/50">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-100">
                    <Users className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-foreground">Clientes recientes</h2>
                    <p className="text-sm text-muted-foreground">Últimas visitas</p>
                  </div>
                </div>
                <Link
                  href="/dashboard/pacientes"
                  className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  Ver todos
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="p-5 space-y-4">
                {clientesRecientes.map((cliente) => (
                  <div
                    key={cliente.nombre}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <AvatarUsuario nombre={cliente.nombre} tamaño="sm" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{cliente.nombre}</p>
                        <p className="text-xs text-muted-foreground">{cliente.ultimaVisita}</p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                      {cliente.servicios} servicios
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.section>
        </div>

        {/* Grafico y actividad */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Grafico de ingresos */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <div className="bg-card border border-border/50 rounded-xl p-5">
              <h3 className="font-semibold text-foreground mb-4">Ingresos semanales</h3>
              <div className="h-48 flex items-end justify-between gap-2">
                {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((dia, i) => {
                  const altura = [60, 80, 45, 90, 75, 95, 40][i]
                  return (
                    <div key={dia} className="flex-1 flex flex-col items-center gap-2">
                      <motion.div
                        className="w-full bg-primary/20 rounded-t-md relative overflow-hidden"
                        initial={{ height: 0 }}
                        animate={{ height: `${altura}%` }}
                        transition={{ delay: 0.5 + i * 0.1, duration: 0.5 }}
                      >
                        <motion.div
                          className="absolute bottom-0 left-0 right-0 bg-primary rounded-t-md"
                          initial={{ height: 0 }}
                          animate={{ height: "100%" }}
                          transition={{ delay: 0.6 + i * 0.1, duration: 0.4 }}
                        />
                      </motion.div>
                      <span className="text-xs text-muted-foreground">{dia}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </motion.section>

          {/* Actividad reciente */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <div className="bg-card border border-border/50 rounded-xl p-5">
              <h3 className="font-semibold text-foreground mb-4">Actividad reciente</h3>
              <div className="space-y-4">
                {[
                  { texto: "Nueva cita agendada con María García", tiempo: "Hace 5 min", tipo: "cita" },
                  { texto: "Pago recibido de Carlos Rodríguez", tiempo: "Hace 1 hora", tipo: "pago" },
                  { texto: "Ana Pérez canceló su cita", tiempo: "Hace 2 horas", tipo: "cancelacion" },
                  { texto: "Nuevo cliente registrado: Luis M.", tiempo: "Hace 3 horas", tipo: "cliente" },
                ].map((actividad, i) => (
                  <motion.div
                    key={i}
                    className="flex items-start gap-3"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 + i * 0.1 }}
                  >
                    <div className={`w-2 h-2 rounded-full mt-2 ${
                      actividad.tipo === "cita" ? "bg-primary" :
                      actividad.tipo === "pago" ? "bg-green-500" :
                      actividad.tipo === "cancelacion" ? "bg-red-500" :
                      "bg-blue-500"
                    }`} />
                    <div className="flex-1">
                      <p className="text-sm text-foreground">{actividad.texto}</p>
                      <p className="text-xs text-muted-foreground">{actividad.tiempo}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.section>
        </div>
      </div>
    </div>
  )
}
