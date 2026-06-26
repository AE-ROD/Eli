"use client"

import { motion } from "framer-motion"
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"
import { DollarSign, Receipt, CalendarCheck } from "lucide-react"
import { TarjetaKpi } from "../../_components/tarjetaKpi"
import { TablaDetalle, type ColumnaTabla } from "../../_components/tablaDetalle"
import { RevenueResponse, COLORS, formatoMoneda, formatoFechaCorta } from "./tipos"

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
}

export function VistaIngresos({ datos }: { datos: RevenueResponse }) {
  const filasTabla = datos.byWorker.map((w) => ({
    trabajador: w.name,
    citas: w.appointments,
    ingresos: formatoMoneda(w.revenue),
    _ingresosRaw: w.revenue,
  }))

  const columnas: ColumnaTabla[] = [
    { key: "trabajador", label: "Trabajador" },
    { key: "citas", label: "Citas", align: "right" },
    { key: "ingresos", label: "Ingresos", align: "right" },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <TarjetaKpi
          label="Ingresos totales"
          valor={formatoMoneda(datos.summary.totalRevenue)}
          icono={DollarSign}
          color="text-amber-500"
          variacionPct={datos.summary.comparisonPct}
        />
        <TarjetaKpi
          label="Ticket promedio"
          valor={formatoMoneda(datos.summary.avgPerAppointment)}
          icono={Receipt}
          color="text-violet-500"
        />
        <TarjetaKpi
          label="Citas completadas"
          valor={datos.summary.totalAppointments}
          icono={CalendarCheck}
          color="text-primary"
        />
      </div>

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border/50 rounded-xl p-5"
      >
        <h2 className="font-semibold text-foreground mb-4">Ingresos en el tiempo</h2>
        {datos.timeSeries.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={datos.timeSeries.map((t) => ({ ...t, label: formatoFechaCorta(t.date) }))}>
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={50} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatoMoneda(v)} />
              <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Ingresos" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-10">Sin datos para el período seleccionado</p>
        )}
      </motion.section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card border border-border/50 rounded-xl p-5"
        >
          <h2 className="font-semibold text-foreground mb-4">Ingresos por trabajador</h2>
          {datos.byWorker.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={datos.byWorker} layout="vertical" margin={{ left: 16 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  width={100}
                />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatoMoneda(v)} />
                <Bar dataKey="revenue" radius={[0, 4, 4, 0]} fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-10">Sin datos</p>
          )}
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-card border border-border/50 rounded-xl p-5"
        >
          <h2 className="font-semibold text-foreground mb-4">Ingresos por método de pago</h2>
          {datos.byPaymentMethod.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={datos.byPaymentMethod}
                  dataKey="amount"
                  nameKey="method"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ method, percent }) => `${method} ${Math.round((percent ?? 0) * 100)}%`}
                >
                  {datos.byPaymentMethod.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatoMoneda(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-10">
              Sin cierres de turno con desglose de pagos en este período
            </p>
          )}
        </motion.section>
      </div>

      <TablaDetalle columnas={columnas} filas={filasTabla} titulo="Detalle por trabajador" />
    </div>
  )
}
