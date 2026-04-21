"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { BarraSuperior } from "@/components/eli/app/barra-superior"
import { TarjetaEstadistica } from "@/components/eli/app/tarjeta-estadistica"
import { TarjetaCita } from "@/components/eli/app/tarjeta-cita"
import {
  CalendarDays,
  Users,
  DollarSign,
  TrendingUp,
  Clock,
  ArrowRight,
} from "lucide-react"
import Link from "next/link"

interface StatsData {
  citasHoy: number
  citasHoyLista: Array<{
    id: string
    title: string
    startTime: string
    endTime: string
    status: string
    patient: { id: string; name: string }
  }>
  totalPacientes: number
  ingresoseMes: number
  tasaOcupacion: number
  tendencias: {
    citas: number
    pacientes: number
    ingresos: number
    ocupacion: number
  }
}

const contenedorVariantes = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
}

const itemVariantes = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
}

function formatHora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

function duracionMinutos(start: string, end: string) {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)
}

export default function DashboardPage() {
  const [stats, setStats] = useState<StatsData | null>(null)

  useEffect(() => {
    fetch("/api/dashboard/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(console.error)
  }, [])

  const fechaActual = new Date().toLocaleDateString("es-ES", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  const estadisticas = stats
    ? [
        {
          titulo: "Citas hoy",
          valor: stats.citasHoy,
          icono: CalendarDays,
          colorIcono: "primario" as const,
          tendencia: { valor: Math.abs(stats.tendencias.citas), esPositiva: stats.tendencias.citas >= 0 },
        },
        {
          titulo: "Clientes activos",
          valor: stats.totalPacientes,
          icono: Users,
          colorIcono: "exito" as const,
          tendencia: { valor: Math.abs(stats.tendencias.pacientes), esPositiva: stats.tendencias.pacientes >= 0 },
        },
        {
          titulo: "Ingresos del mes",
          valor: `$${stats.ingresoseMes.toLocaleString("es-ES")}`,
          icono: DollarSign,
          colorIcono: "info" as const,
          tendencia: { valor: Math.abs(stats.tendencias.ingresos), esPositiva: stats.tendencias.ingresos >= 0 },
        },
        {
          titulo: "Tasa ocupación",
          valor: `${stats.tasaOcupacion}%`,
          icono: TrendingUp,
          colorIcono: "advertencia" as const,
          tendencia: { valor: Math.abs(stats.tendencias.ocupacion), esPositiva: true },
        },
      ]
    : [
        { titulo: "Citas hoy", valor: "—", icono: CalendarDays, colorIcono: "primario" as const },
        { titulo: "Clientes activos", valor: "—", icono: Users, colorIcono: "exito" as const },
        { titulo: "Ingresos del mes", valor: "—", icono: DollarSign, colorIcono: "info" as const },
        { titulo: "Tasa ocupación", valor: "—", icono: TrendingUp, colorIcono: "advertencia" as const },
      ]

  const citasHoy = stats?.citasHoyLista ?? []

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
        <motion.section variants={contenedorVariantes} initial="hidden" animate="show">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {estadisticas.map((stat) => (
              <motion.div key={stat.titulo} variants={itemVariantes}>
                <TarjetaEstadistica
                  titulo={stat.titulo}
                  valor={stat.valor}
                  icono={stat.icono}
                  colorIcono={stat.colorIcono}
                  tendencia={"tendencia" in stat ? stat.tendencia : undefined}
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
                    <p className="text-sm text-muted-foreground">
                      {stats ? `${citasHoy.length} citas programadas` : "Cargando..."}
                    </p>
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
                {citasHoy.length > 0 ? (
                  citasHoy.map((cita) => (
                    <TarjetaCita
                      key={cita.id}
                      cita={{
                        id: cita.id,
                        pacienteNombre: cita.patient.name,
                        servicio: cita.title,
                        horaInicio: formatHora(cita.startTime),
                        horaFin: formatHora(cita.endTime),
                        duracion: duracionMinutos(cita.startTime, cita.endTime),
                        estado: cita.status as any,
                      }}
                      compacta
                    />
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {stats ? "Sin citas para hoy" : "Cargando citas..."}
                  </p>
                )}
              </div>
            </div>
          </motion.section>

          {/* Pacientes recientes */}
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
                    <h2 className="font-semibold text-foreground">Pacientes</h2>
                    <p className="text-sm text-muted-foreground">
                      {stats ? `${stats.totalPacientes} en total` : "Cargando..."}
                    </p>
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
              <div className="p-5">
                {stats && stats.totalPacientes === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Aún no tienes pacientes registrados
                  </p>
                ) : (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {stats ? stats.totalPacientes : "—"} pacientes
                      </p>
                      <p className="text-xs text-muted-foreground">
                        registrados en tu negocio
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.section>
        </div>

        {/* Grafico y actividad */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Grafico de citas por hora */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <div className="bg-card border border-border/50 rounded-xl p-5">
              <h3 className="font-semibold text-foreground mb-4">Citas de hoy por hora</h3>
              {citasHoy.length > 0 ? (
                <div className="space-y-3">
                  {citasHoy.map((cita) => (
                    <div key={cita.id} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-12 flex-shrink-0">
                        {formatHora(cita.startTime)}
                      </span>
                      <div className="flex-1 h-7 bg-primary/10 rounded-lg flex items-center px-3">
                        <span className="text-xs font-medium text-primary truncate">
                          {cita.patient.name} — {cita.title}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                  {stats ? "Sin citas para hoy" : "Cargando..."}
                </div>
              )}
            </div>
          </motion.section>

          {/* Resumen del dia */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <div className="bg-card border border-border/50 rounded-xl p-5">
              <h3 className="font-semibold text-foreground mb-4">Resumen del negocio</h3>
              <div className="space-y-4">
                {[
                  {
                    label: "Citas hoy",
                    valor: stats?.citasHoy ?? "—",
                    color: "bg-primary",
                  },
                  {
                    label: "Total pacientes",
                    valor: stats?.totalPacientes ?? "—",
                    color: "bg-green-500",
                  },
                  {
                    label: "Ingresos este mes",
                    valor: stats ? `$${stats.ingresoseMes.toLocaleString("es-ES")}` : "—",
                    color: "bg-blue-500",
                  },
                  {
                    label: "Tasa de ocupación",
                    valor: stats ? `${stats.tasaOcupacion}%` : "—",
                    color: "bg-orange-500",
                  },
                ].map((item, i) => (
                  <motion.div
                    key={item.label}
                    className="flex items-center justify-between"
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 + i * 0.1 }}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${item.color}`} />
                      <span className="text-sm text-foreground">{item.label}</span>
                    </div>
                    <span className="text-sm font-semibold text-foreground">{item.valor}</span>
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
