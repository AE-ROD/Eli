"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { BarraSuperior } from "@/components/app/layout/barra-superior"
import {
  ArrowLeft,
  Phone,
  Mail,
  CalendarDays,
  DollarSign,
  UserRound,
  Tag,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  UserPlus,
} from "lucide-react"
import Link from "next/link"

const LABEL_PAGO: Record<string, string> = {
  EFECTIVO: "Efectivo", DEBITO: "Débito", CREDITO: "Crédito",
  TRANSFERENCIA: "Transferencia", DIVIDIDO: "Dividido",
}

interface Cita {
  id: string
  title: string
  startTime: string
  endTime: string
  status: string
  isWalkIn: boolean
  price: number | null
  paymentMethod: string | null
  tipAmount: number | null
  notes: string | null
  service: { name: string } | null
  member: { user: { name: string | null } } | null
}

interface PacienteDetalle {
  id: string
  name: string
  lastName: string | null
  email: string | null
  phone: string | null
  tags: string[]
  notes: string | null
  createdAt: string
  appointments: Cita[]
}

const ESTADO_CONFIG: Record<string, { icono: typeof CheckCircle2; color: string; label: string }> = {
  completada: { icono: CheckCircle2, color: "text-emerald-600", label: "Completada" },
  confirmada: { icono: CheckCircle2, color: "text-blue-600", label: "Confirmada" },
  pendiente: { icono: AlertCircle, color: "text-amber-600", label: "Pendiente" },
  cancelada: { icono: XCircle, color: "text-red-500", label: "Cancelada" },
  "en-progreso": { icono: Clock, color: "text-violet-600", label: "En progreso" },
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function formatHora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: false })
}

function diasDesde(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const dias = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (dias === 0) return "hoy"
  if (dias === 1) return "ayer"
  if (dias < 30) return `hace ${dias} días`
  const meses = Math.floor(dias / 30)
  return `hace ${meses} ${meses === 1 ? "mes" : "meses"}`
}

export default function PerfilPacientePage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [paciente, setPaciente] = useState<PacienteDetalle | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/pacientes/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("no-encontrado")
        return r.json()
      })
      .then(setPaciente)
      .catch(() => setError("Cliente no encontrado"))
      .finally(() => setCargando(false))
  }, [id])

  if (cargando) {
    return (
      <div className="min-h-screen">
        <BarraSuperior titulo="Perfil de cliente" subtitulo="Cargando..." />
        <div className="p-6 flex items-center justify-center py-24">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (error || !paciente) {
    return (
      <div className="min-h-screen">
        <BarraSuperior titulo="Perfil de cliente" subtitulo="" />
        <div className="p-6 text-center py-24">
          <p className="text-muted-foreground">{error ?? "Cliente no encontrado"}</p>
          <Link href="/dashboard/pacientes" className="text-primary text-sm mt-4 inline-block hover:underline">
            Volver a clientes
          </Link>
        </div>
      </div>
    )
  }

  const citasNoCanc = paciente.appointments.filter((c) => c.status !== "cancelada")
  const walkIns = paciente.appointments.filter((c) => c.isWalkIn)
  const totalGastado = paciente.appointments
    .filter((c) => c.status === "completada" && c.price != null)
    .reduce((s, c) => s + (c.price ?? 0) + (c.tipAmount ?? 0), 0)
  const ultimaCita = paciente.appointments[0]

  let intervaloPromedio: number | null = null
  if (citasNoCanc.length >= 2) {
    const tiempos = citasNoCanc.map((c) => new Date(c.startTime).getTime()).sort((a, b) => b - a)
    const intervalos = []
    for (let i = 0; i < tiempos.length - 1; i++) {
      intervalos.push((tiempos[i] - tiempos[i + 1]) / (1000 * 60 * 60 * 24))
    }
    intervaloPromedio = Math.round(intervalos.reduce((s, v) => s + v, 0) / intervalos.length)
  }

  const nombreCompleto = [paciente.name, paciente.lastName].filter(Boolean).join(" ")

  return (
    <div className="min-h-screen">
      <BarraSuperior
        titulo={nombreCompleto}
        subtitulo={`Cliente desde ${formatFecha(paciente.createdAt)}`}
      />

      <div className="p-6 space-y-6 max-w-4xl">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a clientes
        </button>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border/50 rounded-xl p-6"
        >
          <div className="flex items-start gap-4 flex-wrap">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <UserRound className="h-7 w-7 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-xl font-bold text-foreground">{nombreCompleto}</h1>
                {walkIns.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    <UserPlus className="h-3 w-3" />
                    Walk-in
                  </span>
                )}
                {paciente.tags.filter((t) => t !== "Walk-in").map((tag) => (
                  <span key={tag} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    <Tag className="h-3 w-3" />
                    {tag}
                  </span>
                ))}
              </div>
              <div className="flex flex-wrap gap-4 mt-2">
                {paciente.phone && (
                  <a href={`tel:${paciente.phone}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <Phone className="h-4 w-4" />
                    {paciente.phone}
                  </a>
                )}
                {paciente.email && (
                  <a href={`mailto:${paciente.email}`} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <Mail className="h-4 w-4" />
                    {paciente.email}
                  </a>
                )}
              </div>
              {paciente.notes && (
                <p className="mt-3 text-sm text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                  {paciente.notes}
                </p>
              )}
            </div>
          </div>
        </motion.div>

        {/* KPIs */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3"
        >
          {[
            { label: "Total visitas", valor: citasNoCanc.length, icono: CalendarDays, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Walk-ins", valor: walkIns.length, icono: UserPlus, color: "text-amber-600", bg: "bg-amber-50" },
            { label: "Total gastado", valor: `$${totalGastado.toLocaleString("es-MX")}`, icono: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
            {
              label: intervaloPromedio ? "Vuelve cada" : "Última visita",
              valor: intervaloPromedio
                ? `${intervaloPromedio}d`
                : ultimaCita ? diasDesde(ultimaCita.startTime) : "—",
              icono: Clock,
              color: "text-violet-600",
              bg: "bg-violet-50",
            },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-card border border-border/50 rounded-xl p-4">
              <div className={`p-2 rounded-lg ${kpi.bg} w-fit mb-3`}>
                <kpi.icono className={`h-4 w-4 ${kpi.color}`} />
              </div>
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
              <p className="text-xl font-bold text-foreground mt-0.5">{kpi.valor}</p>
            </div>
          ))}
        </motion.div>

        {/* Historial */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="bg-card border border-border/50 rounded-xl overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-border/50">
            <h2 className="font-semibold text-foreground">Historial de visitas</h2>
          </div>

          {paciente.appointments.length === 0 ? (
            <div className="p-12 text-center">
              <CalendarDays className="h-8 w-8 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-sm text-muted-foreground">Sin visitas registradas</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {paciente.appointments.map((cita) => {
                const conf = ESTADO_CONFIG[cita.status] ?? ESTADO_CONFIG.pendiente
                const Icono = conf.icono
                return (
                  <div key={cita.id} className="px-6 py-4 flex items-center gap-4">
                    <div className="flex-shrink-0 w-24 text-right">
                      <p className="text-xs font-semibold text-foreground">{formatFecha(cita.startTime)}</p>
                      <p className="text-xs text-muted-foreground">{formatHora(cita.startTime)}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground">
                          {cita.service?.name ?? cita.title}
                        </p>
                        {cita.isWalkIn && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                            Walk-in
                          </span>
                        )}
                      </div>
                      {cita.member?.user?.name && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Atendido por {cita.member.user.name}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 text-right">
                      {cita.price != null && (
                        <div>
                          <span className="text-sm font-semibold text-foreground">
                            ${cita.price.toLocaleString("es-CL")}
                          </span>
                          {cita.tipAmount != null && cita.tipAmount > 0 && (
                            <span className="block text-[10px] text-muted-foreground">
                              +${cita.tipAmount.toLocaleString("es-CL")} propina
                            </span>
                          )}
                          {cita.paymentMethod && (
                            <span className="block text-[10px] text-muted-foreground">
                              {LABEL_PAGO[cita.paymentMethod.toUpperCase()] ?? cita.paymentMethod}
                            </span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Icono className={`h-4 w-4 ${conf.color}`} />
                        <span className={`text-xs font-medium ${conf.color}`}>{conf.label}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
