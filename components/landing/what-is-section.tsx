"use client"

import { motion } from "framer-motion"
import { CalendarDays, Users2, BarChart3, MessageCircle, Globe, Bell } from "lucide-react"

const features = [
  {
    icon: CalendarDays,
    title: "Calendario Visual",
    description: "Vista diaria, semanal y mensual. Gestiona citas con claridad desde cualquier dispositivo. Sin doble-reservas, sin confusión.",
    iconColor: "bg-blue-100/70 text-blue-600",
    borderHover: "hover:border-blue-200/80",
    featured: true,
  },
  {
    icon: Users2,
    title: "CRM de Clientes",
    description: "Fichas completas con historial de visitas, notas y seguimiento por paciente.",
    iconColor: "bg-violet-100/70 text-violet-600",
    borderHover: "hover:border-violet-200/80",
    featured: false,
  },
  {
    icon: BarChart3,
    title: "Reportes y Métricas",
    description: "Dashboard con ingresos, ocupación y tus clientes más frecuentes.",
    iconColor: "bg-emerald-100/70 text-emerald-600",
    borderHover: "hover:border-emerald-200/80",
    featured: false,
  },
  {
    icon: MessageCircle,
    title: "Chat Integrado",
    description: "Comunícate con tus clientes directamente desde el panel. Todo en un solo lugar, sin saltar entre apps.",
    iconColor: "bg-orange-100/70 text-orange-600",
    borderHover: "hover:border-orange-200/80",
    featured: true,
  },
  {
    icon: Globe,
    title: "Página Pública",
    description: "Tus clientes agendan citas 24/7 desde tu link único, sin llamadas ni WhatsApp.",
    iconColor: "bg-cyan-100/70 text-cyan-600",
    borderHover: "hover:border-cyan-200/80",
    featured: false,
  },
  {
    icon: Bell,
    title: "Recordatorios",
    description: "Emails automáticos de confirmación y recordatorio 24h antes de cada cita.",
    iconColor: "bg-rose-100/70 text-rose-600",
    borderHover: "hover:border-rose-200/80",
    featured: false,
  },
]

// Bento: [0:8col] [1:4col] / [2:4col] [3:8col] / [4:6col] [5:6col]
const colSpans = [
  "col-span-12 md:col-span-8",
  "col-span-12 md:col-span-4",
  "col-span-12 md:col-span-4",
  "col-span-12 md:col-span-8",
  "col-span-12 md:col-span-6",
  "col-span-12 md:col-span-6",
]

export function WhatIsSection() {
  return (
    <section id="que-es" className="py-24 bg-transparent">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center max-w-2xl mx-auto mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.45 }}
        >
          <div className="inline-flex items-center gap-2.5 mb-1">
            <div className="h-px w-5 bg-primary/60 rounded-full" />
            <span className="text-xs font-semibold text-primary uppercase tracking-[0.12em]">Qué es Eli</span>
            <div className="h-px w-5 bg-primary/60 rounded-full" />
          </div>
          <h2 className="mt-5 text-3xl sm:text-4xl font-bold text-foreground text-balance">
            Todo lo que necesitas para{" "}
            <span className="font-display italic font-normal text-primary">gestionar tu negocio</span>
          </h2>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            Eli centraliza reservas, clientes, equipo y comunicación en una sola interfaz
            minimalista y profesional.
          </p>
        </motion.div>

        {/* Bento grid */}
        <div className="grid grid-cols-12 gap-4 md:gap-5">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              className={`
                ${colSpans[i]} group relative overflow-hidden bg-card rounded-2xl border border-border/40
                ${feature.borderHover} hover:shadow-[0_10px_40px_-8px_oklch(0_0_0/0.12)]
                hover:-translate-y-0.5 transition-all duration-300
                ${feature.featured ? "p-8 md:p-10" : "p-6"}
              `}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
            >
              {/* Watermark para cards destacadas */}
              {feature.featured && (
                <div className="absolute -right-8 -bottom-8 opacity-[0.045] pointer-events-none">
                  <feature.icon className="h-44 w-44" />
                </div>
              )}

              <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-white/15 via-transparent to-transparent pointer-events-none" />

              {feature.featured ? (
                /* Layout horizontal para cards destacadas */
                <div className="relative flex items-start gap-6">
                  <div className={`w-14 h-14 rounded-2xl ${feature.iconColor} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                    <feature.icon className="h-7 w-7" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground text-xl mb-2">{feature.title}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed max-w-md">{feature.description}</p>
                  </div>
                </div>
              ) : (
                /* Layout vertical para cards normales */
                <div className="relative">
                  <div className={`w-10 h-10 rounded-xl ${feature.iconColor} flex items-center justify-center mb-4`}>
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-semibold text-foreground text-base mb-1.5">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
