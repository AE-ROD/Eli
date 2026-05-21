"use client"

import { motion } from "framer-motion"
import { UserPlus, Globe, CalendarCheck, LayoutDashboard } from "lucide-react"

const steps = [
  {
    number: "01",
    icon: UserPlus,
    title: "Crea tu cuenta",
    description: "Registra tu negocio en menos de 2 minutos. Configura tus servicios, horarios y profesionales.",
    iconColor: "bg-blue-100/70 text-blue-600",
  },
  {
    number: "02",
    icon: Globe,
    title: "Personaliza tu página",
    description: "Obtén tu link único donde tus clientes pueden ver servicios y agendar citas 24/7.",
    iconColor: "bg-violet-100/70 text-violet-600",
  },
  {
    number: "03",
    icon: CalendarCheck,
    title: "Recibe reservas",
    description: "Tus clientes reservan solos. Eli les envía confirmación y recordatorio automático por email.",
    iconColor: "bg-emerald-100/70 text-emerald-600",
  },
  {
    number: "04",
    icon: LayoutDashboard,
    title: "Gestiona todo desde Eli",
    description: "Administra reservas, clientes, equipo y reportes desde una interfaz simple y profesional.",
    iconColor: "bg-orange-100/70 text-orange-600",
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
          <div className="inline-flex items-center gap-2.5 mb-1">
            <div className="h-px w-5 bg-primary/60 rounded-full" />
            <span className="text-xs font-semibold text-primary uppercase tracking-[0.12em]">Cómo funciona</span>
            <div className="h-px w-5 bg-primary/60 rounded-full" />
          </div>
          <h2 className="mt-5 text-3xl sm:text-4xl font-bold text-foreground text-balance">
            Comienza a usarlo{" "}
            <span className="font-display italic font-normal text-primary">en minutos</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            Eli está diseñado para que no necesites capacitación.
            Es tan simple que puedes empezar hoy mismo.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-8">
          {steps.map((step, i) => {
            const Icon = step.icon
            return (
              <motion.div
                key={step.number}
                className="group flex flex-col"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
              >
                {/* Número tipográfico grande — Fraunces serif itálica */}
                <span className="font-display italic font-bold leading-none select-none mb-3 text-primary/12"
                  style={{ fontSize: "clamp(4rem, 8vw, 6rem)" }}
                >
                  {step.number}
                </span>

                {/* Ícono pequeño y plano */}
                <div className={`w-10 h-10 rounded-xl ${step.iconColor} flex items-center justify-center mb-5`}>
                  <Icon className="h-5 w-5" />
                </div>

                <h3 className="text-base font-semibold text-foreground mb-2">
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
    </section>
  )
}
