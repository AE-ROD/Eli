"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { BarraSuperior } from "@/components/app/layout/barra-superior"
import {
  Sparkles,
  TrendingUp,
  Users,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  MessageCircle,
  ChevronRight,
} from "lucide-react"
import Link from "next/link"

interface Sugerencia {
  id: string
  tipo: "ventas" | "retencion" | "horario" | "noshows"
  prioridad: "alta" | "media" | "baja"
  titulo: string
  descripcion: string
  accion: string
  meta?: Record<string, unknown>
}

interface Resumen {
  total: number
  alta: number
  media: number
  ventas: number
  retencion: number
}

const TIPO_CONFIG = {
  ventas: { icono: TrendingUp, color: "text-blue-600", bg: "bg-blue-50", label: "Ventas" },
  retencion: { icono: Users, color: "text-emerald-600", bg: "bg-emerald-50", label: "Retención" },
  horario: { icono: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50", label: "Horario" },
  noshows: { icono: AlertTriangle, color: "text-red-600", bg: "bg-red-50", label: "No-shows" },
}

const PRIORIDAD_CONFIG = {
  alta: { color: "text-red-600", bg: "bg-red-50", label: "Alta prioridad" },
  media: { color: "text-amber-600", bg: "bg-amber-50", label: "Media prioridad" },
  baja: { color: "text-blue-600", bg: "bg-blue-50", label: "Baja prioridad" },
}

function generarMensajeWhatsApp(sugerencia: Sugerencia): string {
  if (!sugerencia.meta) return ""
  const nombre = sugerencia.meta.nombre as string

  if (sugerencia.tipo === "retencion") {
    const dias = sugerencia.meta.diasSinVolver as number
    return encodeURIComponent(
      `¡Hola ${nombre}! 👋 Hace ${dias} días que no te vemos. Nos encantaría verte pronto — ¿tienes disponibilidad esta semana? Reserva en línea o escríbenos aquí.`
    )
  }
  if (sugerencia.tipo === "noshows") {
    return encodeURIComponent(
      `¡Hola ${nombre}! 😊 Notamos que tienes citas pendientes que no pudiste atender. ¿Te gustaría reagendar? Estamos para ayudarte — cuéntanos cuándo te queda mejor.`
    )
  }
  return ""
}

export default function AgentesPage() {
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([])
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [cargando, setCargando] = useState(true)
  const [filtro, setFiltro] = useState<"todos" | "ventas" | "retencion" | "horario" | "noshows">("todos")

  const cargar = () => {
    setCargando(true)
    fetch("/api/agents/sugerencias")
      .then((r) => r.json())
      .then((data) => {
        setSugerencias(data.sugerencias ?? [])
        setResumen(data.resumen ?? null)
      })
      .catch(console.error)
      .finally(() => setCargando(false))
  }

  useEffect(() => { cargar() }, [])

  const filtradas = sugerencias.filter((s) =>
    filtro === "todos" ? true : s.tipo === filtro
  )

  return (
    <div className="min-h-screen">
      <BarraSuperior
        titulo="Agentes de IA"
        subtitulo="Recomendaciones para tu negocio"
        accionPrincipal={{ texto: "Actualizar", onClick: cargar }}
      />

      <div className="p-6 space-y-6">
        {/* Resumen */}
        {resumen && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total sugerencias", valor: resumen.total, color: "text-foreground" },
              { label: "Alta prioridad", valor: resumen.alta, color: "text-red-600" },
              { label: "Agente ventas", valor: resumen.ventas, color: "text-blue-600" },
              { label: "Agente retención", valor: resumen.retencion, color: "text-emerald-600" },
            ].map((kpi) => (
              <motion.div
                key={kpi.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-border/50 rounded-xl p-4"
              >
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className={`text-2xl font-bold mt-1 ${kpi.color}`}>{kpi.valor}</p>
              </motion.div>
            ))}
          </div>
        )}

        {/* Filtros */}
        <div className="flex gap-2">
          {(["todos", "ventas", "retencion", "horario", "noshows"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filtro === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {{ todos: "Todos", ventas: "Ventas", retencion: "Retención", horario: "Horarios", noshows: "No-shows" }[f]}
            </button>
          ))}
        </div>

        {/* Lista de sugerencias */}
        {cargando ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="h-6 w-6 text-muted-foreground animate-spin" />
          </div>
        ) : filtradas.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-card border border-border/50 rounded-xl p-12 text-center"
          >
            <Sparkles className="h-10 w-10 text-primary mx-auto mb-3 opacity-60" />
            <p className="font-semibold text-foreground">Todo en orden</p>
            <p className="text-sm text-muted-foreground mt-1">
              Los agentes no detectaron oportunidades de mejora en este momento.
            </p>
          </motion.div>
        ) : (
          <div className="space-y-3">
            {filtradas.map((s, i) => {
              const tipoConf = TIPO_CONFIG[s.tipo]
              const prioridadConf = PRIORIDAD_CONFIG[s.prioridad]
              const TipoIcono = tipoConf.icono
              const whatsappMsg = generarMensajeWhatsApp(s)
              const telefono = s.meta?.telefono as string | undefined

              return (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="bg-card border border-border/50 rounded-xl p-5 flex gap-4"
                >
                  <div className={`p-2.5 rounded-xl ${tipoConf.bg} flex-shrink-0 h-fit`}>
                    <TipoIcono className={`h-5 w-5 ${tipoConf.color}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <p className="font-semibold text-foreground text-sm">{s.titulo}</p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${prioridadConf.bg} ${prioridadConf.color}`}
                        >
                          {prioridadConf.label}
                        </span>
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${tipoConf.bg} ${tipoConf.color}`}
                        >
                          {tipoConf.label}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{s.descripcion}</p>

                    <div className="flex items-center gap-2 mt-3">
                      {(s.tipo === "retencion" || s.tipo === "noshows") && telefono && whatsappMsg ? (
                        <a
                          href={`https://wa.me/${telefono.replace(/\D/g, "")}?text=${whatsappMsg}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-xs font-medium hover:bg-emerald-600 transition-colors"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          Enviar WhatsApp
                        </a>
                      ) : s.tipo === "ventas" ? (
                        <Link
                          href="/dashboard/analytics"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          {s.accion}
                        </Link>
                      ) : s.tipo === "horario" ? (
                        <Link
                          href="/dashboard/analytics"
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-600 text-xs font-medium hover:bg-amber-500/20 transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          Ver analítica
                        </Link>
                      ) : (
                        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs font-medium hover:bg-muted/80 transition-colors">
                          <ChevronRight className="h-3.5 w-3.5" />
                          {s.accion}
                        </button>
                      )}
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
