"use client"

import { motion } from "framer-motion"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { TablaDetalle, type ColumnaTabla } from "../../_components/tablaDetalle"
import { StaffResponse, formatoMoneda } from "./tipos"

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
}

export function VistaTrabajadores({ datos }: { datos: StaffResponse }) {
  const filasTabla = datos.workers.map((w) => ({
    trabajador: w.name,
    citasTotal: w.totalAppointments,
    completadas: w.completedAppointments,
    canceladas: w.cancelledAppointments,
    ingresos: formatoMoneda(w.revenue),
    ticketPromedio: formatoMoneda(w.avgTicket),
    ocupacion: `${w.occupancyRate}%`,
  }))

  const columnas: ColumnaTabla[] = [
    { key: "trabajador", label: "Trabajador" },
    { key: "citasTotal", label: "Citas", align: "right" },
    { key: "completadas", label: "Completadas", align: "right" },
    { key: "canceladas", label: "Canceladas", align: "right" },
    { key: "ingresos", label: "Ingresos", align: "right" },
    { key: "ticketPromedio", label: "Ticket prom.", align: "right" },
    { key: "ocupacion", label: "Ocupación", align: "right" },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border/50 rounded-xl p-5"
        >
          <h2 className="font-semibold text-foreground mb-4">Citas por trabajador</h2>
          <ResponsiveContainer width="100%" height={Math.max(220, datos.workers.length * 40)}>
            <BarChart data={datos.workers} layout="vertical" margin={{ left: 16 }}>
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={100} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="totalAppointments" radius={[0, 4, 4, 0]} fill="hsl(var(--primary))" name="Citas" />
            </BarChart>
          </ResponsiveContainer>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card border border-border/50 rounded-xl p-5"
        >
          <h2 className="font-semibold text-foreground mb-4">Tasa de ocupación por trabajador</h2>
          <ResponsiveContainer width="100%" height={Math.max(220, datos.workers.length * 40)}>
            <BarChart data={datos.workers} layout="vertical" margin={{ left: 16 }}>
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={100} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
              <Bar dataKey="occupancyRate" radius={[0, 4, 4, 0]} fill="hsl(var(--success))" name="Ocupación" />
            </BarChart>
          </ResponsiveContainer>
        </motion.section>
      </div>

      <TablaDetalle columnas={columnas} filas={filasTabla} titulo="Detalle por trabajador" />
    </div>
  )
}
