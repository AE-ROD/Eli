"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { CheckCircle2, Circle, Settings, CalendarDays, Link2, X } from "lucide-react"
import Link from "next/link"

interface OnboardingState {
  tieneServicio: boolean
  tieneHorario: boolean
  tienePrimeraCita: boolean
  slug: string
}

interface Step {
  key: keyof Omit<OnboardingState, "slug">
  label: string
  descripcion: string
  accion: { texto: string; href: string }
  icon: React.ElementType
}

const STEPS: Step[] = [
  {
    key: "tieneServicio",
    label: "Agrega un servicio",
    descripcion: "Define los servicios que ofrece tu negocio con precio y duración.",
    accion: { texto: "Ir a configuración", href: "/dashboard/configuracion" },
    icon: Settings,
  },
  {
    key: "tieneHorario",
    label: "Confirma tu horario",
    descripcion: "Establece los días y horas en que recibes citas.",
    accion: { texto: "Configurar horario", href: "/dashboard/configuracion" },
    icon: CalendarDays,
  },
  {
    key: "tienePrimeraCita",
    label: "Recibe tu primera reserva",
    descripcion: "Comparte tu enlace de reservas con un cliente.",
    accion: { texto: "Ver mi enlace", href: "/dashboard" },
    icon: Link2,
  },
]

const STORAGE_KEY = "eli-onboarding-dismissed"

export function ChecklistOnboarding() {
  const [estado, setEstado] = useState<OnboardingState | null>(null)
  const [descartado, setDescartado] = useState(false)

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY)) {
      setDescartado(true)
      return
    }
    fetch("/api/dashboard/onboarding")
      .then((r) => r.json())
      .then(setEstado)
      .catch(console.error)
  }, [])

  const descartar = () => {
    localStorage.setItem(STORAGE_KEY, "1")
    setDescartado(true)
  }

  if (descartado || !estado) return null

  const completados = STEPS.filter((s) => estado[s.key]).length
  const total = STEPS.length
  const porcentaje = Math.round((completados / total) * 100)

  // Hide once fully complete (auto-dismiss after a moment)
  if (completados === total) return null

  return (
    <AnimatePresence>
      <motion.section
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="bg-card border border-border/50 rounded-xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h2 className="font-semibold text-foreground">Configura tu negocio</h2>
              <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                {completados}/{total}
              </span>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${porcentaje}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </div>
          </div>
          <button
            onClick={descartar}
            className="ml-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex-shrink-0"
            aria-label="Ocultar checklist"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Steps */}
        <div className="px-5 pb-5 space-y-3">
          {STEPS.map((step, i) => {
            const completo = estado[step.key]
            const Icon = step.icon
            return (
              <motion.div
                key={step.key}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
                  completo ? "opacity-50" : "bg-muted/40"
                }`}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {completo ? (
                    <CheckCircle2 className="h-5 w-5 text-success" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${completo ? "line-through text-muted-foreground" : "text-foreground"}`}>
                    {step.label}
                  </p>
                  {!completo && (
                    <p className="text-xs text-muted-foreground mt-0.5">{step.descripcion}</p>
                  )}
                </div>
                {!completo && (
                  <Link
                    href={step.key === "tienePrimeraCita" && estado.slug
                      ? `/reservar/${estado.slug}`
                      : step.accion.href}
                    target={step.key === "tienePrimeraCita" ? "_blank" : undefined}
                    className="flex-shrink-0 text-xs font-medium text-primary hover:text-primary/80 transition-colors whitespace-nowrap"
                  >
                    {step.accion.texto} →
                  </Link>
                )}
              </motion.div>
            )
          })}
        </div>
      </motion.section>
    </AnimatePresence>
  )
}
