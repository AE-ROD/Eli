"use client"

import { motion } from "framer-motion"
import { CalendarDays, Users2, BarChart3, MessageCircle, Globe, Bell } from "lucide-react"

const features = [
  {
    icon: CalendarDays,
    title: "Calendario Visual",
    description: "Vista diaria, semanal y mensual. Gestiona citas con claridad desde cualquier dispositivo.",
    color: "bg-blue-50 text-blue-600",
    border: "hover:border-blue-200",
  },
  {
    icon: Users2,
    title: "CRM de Clientes",
    description: "Fichas completas con historial de visitas, notas y seguimiento por paciente.",
    color: "bg-violet-50 text-violet-600",
    border: "hover:border-violet-200",
  },
  {
    icon: BarChart3,
    title: "Reportes y Métricas",
    description: "Dashboard con ingresos, ocupación y tus clientes más frecuentes.",
    color: "bg-emerald-50 text-emerald-600",
    border: "hover:border-emerald-200",
  },
  {
    icon: MessageCircle,
    title: "Chat Integrado",
    description: "Comunícate con tus clientes directamente desde el panel, sin salir de Eli.",
    color: "bg-orange-50 text-orange-600",
    border: "hover:border-orange-200",
  },
  {
    icon: Globe,
    title: "Página Pública",
    description: "Tus clientes agendan citas 24/7 desde tu link único, sin llamadas ni WhatsApp.",
    color: "bg-cyan-50 text-cyan-600",
    border: "hover:border-cyan-200",
  },
  {
    icon: Bell,
    title: "Recordatorios",
    description: "Emails automáticos de confirmación y recordatorio 24h antes de cada cita.",
    color: "bg-rose-50 text-rose-600",
    border: "hover:border-rose-200",
  },
]

export function WhatIsSection() {
  return (
    <section id="que-es" className="py-24 bg-transparent">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center max-w-2xl mx-auto mb-20"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.45 }}
        >
          <span className="text-sm font-semibold text-primary bg-primary/10 px-3 py-1 rounded-full uppercase tracking-wider">
            Qué es Eli
          </span>
          <h2 className="mt-6 text-3xl sm:text-4xl font-bold text-foreground text-balance">
            Todo lo que necesitas para gestionar tu negocio
          </h2>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            Eli centraliza reservas, clientes, equipo y comunicación en una sola interfaz
            minimalista y profesional.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              className={`group relative overflow-hidden bg-card rounded-2xl p-6 border border-border/50 ${feature.border} hover:shadow-xl hover:-translate-y-1 transition-all duration-300`}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, delay: i * 0.07 }}
            >
              {/* Shine overlay — D */}
              <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-white/20 via-transparent to-transparent pointer-events-none" />
              <div className={`w-12 h-12 rounded-xl ${feature.color} flex items-center justify-center mb-4`}>
                <feature.icon className="h-6 w-6" />
              </div>
              <h3 className="font-semibold text-foreground text-lg mb-1">
                {feature.title}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
