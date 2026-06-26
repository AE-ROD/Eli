"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { useSession } from "next-auth/react"
import { BarraSuperior } from "@/components/app/layout/barra-superior"
import { TarjetaEstadistica } from "@/components/app/tarjetas/tarjeta-estadistica"
import { TarjetaCita } from "@/components/app/tarjetas/tarjeta-cita"
import { ChecklistOnboarding } from "@/components/app/tarjetas/checklist-onboarding"
import {
  CalendarDays,
  Users,
  DollarSign,
  TrendingUp,
  Clock,
  ArrowRight,
  Link2,
  Copy,
  Check,
  Sparkles,
  FileUp,
  UserPlus,
  TrendingDown,
  Settings,
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
  ingresosProyectados: number
  walkInsEsteMes: number
  tasaOcupacion: number
  tieneServicios: boolean
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
  const router = useRouter()
  const [stats, setStats] = useState<StatsData | null>(null)
  const [copiado, setCopiado] = useState(false)
  const { data: session } = useSession()
  const businessSlug = (session?.user as any)?.businessSlug ?? ""
  const enlaceReservas = typeof window !== "undefined" && businessSlug
    ? `${window.location.origin}/reservar/${businessSlug}`
    : businessSlug ? `/reservar/${businessSlug}` : ""

  const copiarEnlace = async () => {
    if (!enlaceReservas) return
    await navigator.clipboard.writeText(enlaceReservas)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

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
          onClick: () => router.push("/dashboard/calendario?nuevaCita=1"),
        }}
      />

      <div className="p-6 space-y-8">
        {/* Onboarding checklist — hides automatically once all steps are done */}
        <ChecklistOnboarding />

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
                  <div className="text-center py-6 space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {stats ? "Sin citas para hoy" : "Cargando citas..."}
                    </p>
                    {stats && enlaceReservas && (
                      <a
                        href={enlaceReservas}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline"
                      >
                        Comparte tu enlace para recibir reservas →
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.section>

          {/* Usuarios recientes */}
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
                    <h2 className="font-semibold text-foreground">Usuarios</h2>
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
                  <div className="text-center py-6 space-y-2">
                    <p className="text-sm text-muted-foreground">Aún no tienes usuarios registrados</p>
                    <a href="/dashboard/importar" className="text-xs text-primary hover:underline">
                      Importa tus clientes existentes →
                    </a>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {stats ? stats.totalPacientes : "—"} usuarios
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

        {/* Enlace de reservas */}
        {enlaceReservas && (
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10 flex-shrink-0">
                <Link2 className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground mb-0.5">Tu enlace de reservas</p>
                <p className="text-xs text-muted-foreground truncate font-mono">{enlaceReservas}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={copiarEnlace}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background border border-border hover:bg-muted transition-colors text-sm font-medium"
                >
                  {copiado ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
                  {copiado ? "Copiado" : "Copiar"}
                </button>
                <Link
                  href={`/reservar/${businessSlug}`}
                  target="_blank"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
                >
                  Ver página
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </motion.section>
        )}

        {/* Pronóstico de ingresos + Acciones rápidas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pronóstico */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.33 }}
          >
            <div className="bg-card border border-border/50 rounded-xl p-5 h-full">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-emerald-100">
                  <TrendingDown className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">Pronóstico del mes</h2>
                  <p className="text-xs text-muted-foreground">Completado + confirmado</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Ingresos completados</span>
                  <span className="text-sm font-semibold text-foreground">
                    ${(stats?.ingresoseMes ?? 0).toLocaleString("es-MX")}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Proyección fin de mes</span>
                  <span className="text-sm font-bold text-emerald-600">
                    ${(stats?.ingresosProyectados ?? 0).toLocaleString("es-MX")}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-border/40 pt-3 mt-1">
                  <span className="text-sm text-muted-foreground">Walk-ins este mes</span>
                  <span className="text-sm font-semibold text-foreground">
                    {stats?.walkInsEsteMes ?? 0}
                  </span>
                </div>
                {stats && stats.ingresosProyectados > 0 && (
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-2">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{
                        width: `${Math.min((stats.ingresoseMes / stats.ingresosProyectados) * 100, 100)}%`,
                      }}
                    />
                  </div>
                )}
                {stats && stats.ingresoseMes === 0 && stats.ingresosProyectados === 0 && (
                  <p className="text-xs text-muted-foreground text-center pt-2">
                    Los datos de ingresos aparecerán cuando registres citas completadas.
                  </p>
                )}
              </div>
            </div>
          </motion.section>

          {/* Acciones rápidas */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.37 }}
          >
            <div className="bg-card border border-border/50 rounded-xl p-5 h-full">
              <h2 className="font-semibold text-foreground mb-4">Acciones rápidas</h2>
              <div className="grid grid-cols-1 gap-2">
                {(stats?.tieneServicios
                  ? [
                      { icono: UserPlus, label: "Registrar walk-in", href: "/dashboard/walk-in", color: "text-blue-600 bg-blue-50" },
                      { icono: FileUp, label: "Importar clientes", href: "/dashboard/importar", color: "text-violet-600 bg-violet-50" },
                      { icono: Sparkles, label: "Ver sugerencias IA", href: "/dashboard/agentes", color: "text-amber-600 bg-amber-50" },
                      { icono: TrendingUp, label: "Analítica del negocio", href: "/dashboard/analytics", color: "text-emerald-600 bg-emerald-50" },
                    ]
                  : [
                      { icono: Settings, label: "Crear primer servicio", href: "/dashboard/configuracion", color: "text-blue-600 bg-blue-50" },
                      { icono: CalendarDays, label: "Configurar horarios", href: "/dashboard/configuracion", color: "text-violet-600 bg-violet-50" },
                      { icono: UserPlus, label: "Registrar walk-in", href: "/dashboard/walk-in", color: "text-amber-600 bg-amber-50" },
                      { icono: FileUp, label: "Importar clientes", href: "/dashboard/importar", color: "text-emerald-600 bg-emerald-50" },
                    ]
                ).map((accion) => (
                  <Link
                    key={accion.href}
                    href={accion.href}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted transition-colors"
                  >
                    <div className={`p-1.5 rounded-lg ${accion.color.split(" ")[1]}`}>
                      <accion.icono className={`h-4 w-4 ${accion.color.split(" ")[0]}`} />
                    </div>
                    <span className="text-sm font-medium text-foreground">{accion.label}</span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground ml-auto" />
                  </Link>
                ))}
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
                    label: "Total usuarios",
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
