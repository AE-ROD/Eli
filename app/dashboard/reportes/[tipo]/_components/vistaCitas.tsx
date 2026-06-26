"use client"

import { motion } from "framer-motion"
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { CalendarCheck, CheckCircle2, XCircle, Clock } from "lucide-react"
import { TarjetaKpi } from "../../_components/tarjetaKpi"
import { TablaDetalle, type ColumnaTabla } from "../../_components/tablaDetalle"
import { AppointmentsResponse, COLORS } from "./tipos"

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
}

const STATUS_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  confirmada: "Confirmada",
  "en-progreso": "En progreso",
  completada: "Completada",
  cancelada: "Cancelada",
}

export function VistaCitas({ datos }: { datos: AppointmentsResponse }) {
  const filasTabla = datos.byService.map((s) => ({
    servicio: s.name,
    citas: s.count,
  }))

  const columnas: ColumnaTabla[] = [
    { key: "servicio", label: "Servicio" },
    { key: "citas", label: "Citas", align: "right" },
  ]

  const maxHora = Math.max(...datos.byHour.map((h) => h.count), 1)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <TarjetaKpi label="Total de citas" valor={datos.summary.total} icono={CalendarCheck} color="text-primary" />
        <TarjetaKpi
          label="Completadas"
          valor={`${datos.summary.completed} (${datos.summary.completionRate}%)`}
          icono={CheckCircle2}
          color="text-success"
        />
        <TarjetaKpi
          label="Canceladas"
          valor={`${datos.summary.cancelled} (${datos.summary.cancellationRate}%)`}
          icono={XCircle}
          color="text-destructive"
        />
        <TarjetaKpi label="Pendientes" valor={datos.summary.pending} icono={Clock} color="text-amber-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border/50 rounded-xl p-5"
        >
          <h2 className="font-semibold text-foreground mb-4">Citas por día de la semana</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={datos.byDayOfWeek}>
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={24} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="hsl(var(--primary))" name="Citas" />
            </BarChart>
          </ResponsiveContainer>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card border border-border/50 rounded-xl p-5"
        >
          <h2 className="font-semibold text-foreground mb-4">Distribución por estado</h2>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={datos.byStatus.map((s) => ({ name: STATUS_LABEL[s.status] ?? s.status, value: s.count }))}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ name, percent }) => `${name} ${Math.round((percent ?? 0) * 100)}%`}
              >
                {datos.byStatus.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </motion.section>
      </div>

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-card border border-border/50 rounded-xl p-5"
      >
        <h2 className="font-semibold text-foreground mb-4">Citas por hora del día</h2>
        <div className="grid grid-cols-12 sm:grid-cols-24 gap-1">
          {datos.byHour.map((h) => (
            <div key={h.hour} className="flex flex-col items-center gap-1">
              <div
                className="w-full rounded-sm bg-primary"
                style={{
                  height: 60,
                  opacity: h.count === 0 ? 0.08 : 0.25 + 0.75 * (h.count / maxHora),
                }}
                title={`${h.hour}:00 — ${h.count} citas`}
              />
              <span className="text-[9px] text-muted-foreground">{h.hour}</span>
            </div>
          ))}
        </div>
      </motion.section>

      <TablaDetalle columnas={columnas} filas={filasTabla} titulo="Detalle por servicio" />
    </div>
  )
}
