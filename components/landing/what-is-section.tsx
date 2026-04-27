"use client"

import { motion } from "framer-motion"
import { CalendarDays, Users2, BarChart3, MessageCircle, Globe, Bell } from "lucide-react"

const features = [
  {
    icon: CalendarDays,
    title: "Calendario Visual",
    description: "Vista diaria, semanal y mensual con drag & drop intuitivo.",
  },
  {
    icon: Users2,
    title: "CRM de Clientes",
    description: "Fichas completas con historial de visitas, notas y etiquetas.",
  },
  {
    icon: BarChart3,
    title: "Reportes y Métricas",
    description: "Dashboard con ingresos, ocupación y clientes frecuentes.",
  },
  {
    icon: MessageCircle,
    title: "Chat Integrado",
    description: "Comunícate con tus clientes directamente desde el panel.",
  },
  {
    icon: Globe,
    title: "Página Pública",
    description: "Tus clientes agendan citas 24/7 desde cualquier dispositivo.",
  },
  {
    icon: Bell,
    title: "Recordatorios",
    description: "Notificaciones automáticas por email con archivo .ics.",
  },
]

export function WhatIsSection() {
  return (
    <section id="que-es" className="py-24 bg-secondary/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center max-w-3xl mx-auto mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.45 }}
        >
          <span className="text-sm font-medium text-primary uppercase tracking-wider">
            Qué es Eli
          </span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-foreground text-balance">
            Todo lo que necesitas para gestionar tu negocio
          </h2>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            Eli resuelve la fragmentación de herramientas que sufren los negocios de bienestar
            al centralizar todo en una sola interfaz minimalista y profesional.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              className="group relative bg-card rounded-2xl p-6 border border-border/50 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300"
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.4, delay: i * 0.07 }}
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors duration-300">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-lg">
                    {feature.title}
                  </h3>
                  <p className="mt-1 text-muted-foreground text-sm">
                    {feature.description}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
