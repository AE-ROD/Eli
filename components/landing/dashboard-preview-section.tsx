"use client"

import { motion } from "framer-motion"
import { useState } from "react"
import { LayoutDashboard, CalendarDays, Users, MessageCircle } from "lucide-react"

const tabs = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "calendario", label: "Calendario", icon: CalendarDays },
  { id: "pacientes", label: "Pacientes", icon: Users },
  { id: "chat", label: "Chat", icon: MessageCircle },
]

function DashboardMockup({ activeTab }: { activeTab: string }) {
  return (
    <div className="bg-card rounded-xl border border-border/50 overflow-hidden shadow-2xl shadow-primary/5">
      <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b border-border/50">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <div className="w-3 h-3 rounded-full bg-yellow-400" />
          <div className="w-3 h-3 rounded-full bg-green-400" />
        </div>
        <div className="flex-1 flex justify-center">
          <div className="px-4 py-1 rounded-md bg-background text-xs text-muted-foreground">
            eli.app/mi-negocio
          </div>
        </div>
      </div>

      <div className="flex min-h-[400px] md:min-h-[500px]">
        <div className="hidden md:flex flex-col w-56 bg-muted/30 border-r border-border/50 p-4">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
              E
            </div>
            <span className="font-semibold text-foreground">Mi Negocio</span>
          </div>
          <nav className="space-y-1">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  activeTab === tab.id
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground"
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </div>
            ))}
          </nav>
        </div>

        <div className="flex-1 p-6">
          {activeTab === "dashboard" && <DashboardContent />}
          {activeTab === "calendario" && <CalendarContent />}
          {activeTab === "pacientes" && <PatientsContent />}
          {activeTab === "chat" && <ChatContent />}
        </div>
      </div>
    </div>
  )
}

function DashboardContent() {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-foreground">Resumen del día</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Citas hoy", value: "8" },
          { label: "Esta semana", value: "42" },
          { label: "Ingresos est.", value: "$2,450" },
          { label: "Ocupación", value: "78%" },
        ].map((stat) => (
          <div key={stat.label} className="bg-muted/50 rounded-lg p-4">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{stat.value}</p>
          </div>
        ))}
      </div>
      <div className="bg-muted/30 rounded-lg p-4 h-32 flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Gráfico de citas por semana</p>
      </div>
    </div>
  )
}

function CalendarContent() {
  const hours = ["09:00", "10:00", "11:00", "12:00", "13:00"]
  const appointments = [
    { time: "09:00", name: "María G.", service: "Corte + Tinte" },
    { time: "11:00", name: "Carlos R.", service: "Corte de cabello" },
    { time: "13:00", name: "Ana P.", service: "Manicure" },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Hoy, 16 de Abril</h3>
        <div className="flex gap-2">
          <button className="px-3 py-1 text-xs rounded-md bg-muted text-muted-foreground">Día</button>
          <button className="px-3 py-1 text-xs rounded-md bg-primary text-primary-foreground">Semana</button>
        </div>
      </div>
      <div className="space-y-2">
        {hours.map((hour) => {
          const appointment = appointments.find((a) => a.time === hour)
          return (
            <div key={hour} className="flex gap-4">
              <span className="text-xs text-muted-foreground w-12">{hour}</span>
              {appointment ? (
                <div className="flex-1 bg-primary/10 border-l-2 border-primary rounded-r-lg p-2">
                  <p className="text-sm font-medium text-foreground">{appointment.name}</p>
                  <p className="text-xs text-muted-foreground">{appointment.service}</p>
                </div>
              ) : (
                <div className="flex-1 border border-dashed border-border/50 rounded-lg h-10" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PatientsContent() {
  const patients = [
    { name: "María García", email: "maria@email.com", visits: 12, tag: "VIP" },
    { name: "Carlos Rodríguez", email: "carlos@email.com", visits: 5, tag: "Frecuente" },
    { name: "Ana Pérez", email: "ana@email.com", visits: 2, tag: "Nuevo" },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Clientes</h3>
        <div className="px-3 py-1.5 rounded-lg bg-muted text-xs text-muted-foreground">
          Buscar cliente...
        </div>
      </div>
      <div className="space-y-2">
        {patients.map((patient) => (
          <div key={patient.name} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                {patient.name.charAt(0)}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{patient.name}</p>
                <p className="text-xs text-muted-foreground">{patient.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{patient.visits} visitas</span>
              <span className={`px-2 py-0.5 rounded-full text-xs ${
                patient.tag === "VIP" ? "bg-yellow-100 text-yellow-700" :
                patient.tag === "Frecuente" ? "bg-green-100 text-green-700" :
                "bg-blue-100 text-blue-700"
              }`}>
                {patient.tag}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ChatContent() {
  const messages = [
    { from: "client", text: "Hola, quisiera confirmar mi cita de mañana", time: "10:30" },
    { from: "business", text: "¡Hola María! Sí, tienes cita mañana a las 10:00 para corte y tinte.", time: "10:32" },
    { from: "client", text: "¡Perfecto! Muchas gracias", time: "10:33" },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between pb-4 border-b border-border/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">M</div>
          <div>
            <p className="text-sm font-medium text-foreground">María García</p>
            <p className="text-xs text-green-500">En línea</p>
          </div>
        </div>
      </div>
      <div className="flex-1 py-4 space-y-3 overflow-y-auto">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.from === "business" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] px-3 py-2 rounded-lg ${
              msg.from === "business" ? "bg-primary text-primary-foreground" : "bg-muted"
            }`}>
              <p className="text-sm">{msg.text}</p>
              <p className={`text-xs mt-1 ${msg.from === "business" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                {msg.time}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="pt-4 border-t border-border/50">
        <div className="flex gap-2">
          <div className="flex-1 px-3 py-2 rounded-lg bg-muted text-sm text-muted-foreground">
            Escribe un mensaje...
          </div>
          <button className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm">
            Enviar
          </button>
        </div>
      </div>
    </div>
  )
}

export function DashboardPreviewSection() {
  const [activeTab, setActiveTab] = useState("dashboard")

  return (
    <section className="py-24 bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center max-w-3xl mx-auto mb-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.45 }}
        >
          <span className="text-sm font-medium text-primary uppercase tracking-wider">
            Vista previa
          </span>
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-foreground text-balance">
            Una interfaz que amarás usar
          </h2>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            Diseñada para ser simple, profesional y eficiente.
            Explora las diferentes secciones del panel de Eli.
          </p>
        </motion.div>

        <motion.div
          className="flex justify-center gap-2 mb-8"
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.5, delay: 0.15 }}
        >
          <DashboardMockup activeTab={activeTab} />
        </motion.div>
      </div>
    </section>
  )
}
