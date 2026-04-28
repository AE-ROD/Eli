"use client"

import { motion } from "framer-motion"
import { UserPlus, Globe, CalendarCheck, LayoutDashboard } from "lucide-react"

const steps = [
  {
    number: "01",
    icon: UserPlus,
    title: "Crea tu cuenta",
    description: "Registra tu negocio en menos de 2 minutos. Configura tus servicios, horarios y profesionales.",
    color: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400",
    border: "border-blue-100 dark:border-blue-900",
  },
  {
    number: "02",
    icon: Globe,
    title: "Personaliza tu página",
    description: "Obtén tu link único donde tus clientes pueden ver servicios y agendar citas 24/7.",
    color: "bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-400",
    border: "border-violet-100 dark:border-violet-900",
  },
  {
    number: "03",
    icon: CalendarCheck,
    title: "Recibe reservas",
    description: "Tus clientes reservan solos. Eli les envía confirmación y recordatorio automático por email.",
    color: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
    border: "border-emerald-100 dark:border-emerald-900",
  },
  {
    number: "04",
    icon: LayoutDashboard,
    title: "Gestiona todo desde Eli",
    description: "Administra reservas, clientes, equipo y reportes desde una interfaz simple y profesional.",
    color: "bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-400",
    border: "border-orange-100 dark:border-orange-900",
  },
]

export function HowItWorksSection() {
  return (
    <section id="como-funciona" className="py-24 bg-transparent">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        <motion.div
          className="text-center max-w-2xl mx-auto mb-20"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.45 }}
        >
          <span className="text-sm font-semibold text-primary bg-primary/10 px-3 py-1 rounded-full uppercase tracking-wider">
            Cómo funciona
          </span>
          <h2 className="mt-6 text-3xl sm:text-4xl font-bold text-foreground text-balance">
            Comienza a usarlo en minutos
          </h2>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            Eli está diseñado para que no necesites capacitación.
            Es tan simple que puedes empezar hoy mismo.
          </p>
        </motion.div>

        <div className="relative">
          {/* Línea conectora horizontal (solo desktop) */}
          <div className="hidden lg:block absolute top-14 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-transparent via-border to-transparent" />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
            {steps.map((step, i) => {
              const Icon = step.icon
              return (
                <motion.div
                  key={step.number}
                  className="group relative flex flex-col items-center text-center"
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                >
                  {/* Número + Ícono con hover — D + E */}
                  <div className="relative mb-6">
                    {/* Número grande de fondo — E */}
                    <span className="absolute -top-3 -right-6 text-8xl font-black text-foreground/[0.045] select-none pointer-events-none leading-none z-0">
                      {step.number}
                    </span>
                    <div className={`relative z-10 w-28 h-28 rounded-2xl border-2 ${step.color} ${step.border} flex items-center justify-center shadow-sm group-hover:shadow-lg group-hover:-translate-y-1 transition-all duration-300`}>
                      {/* Shine — D */}
                      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-400 bg-gradient-to-br from-white/25 to-transparent pointer-events-none" />
                      <Icon className="h-10 w-10 relative z-10" />
                    </div>
                    <span className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shadow-md shadow-primary/20 z-20">
                      {step.number}
                    </span>
                  </div>

                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {step.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </motion.div>
              )
            })}
          </div>
        </div>

      </div>
    </section>
  )
}
