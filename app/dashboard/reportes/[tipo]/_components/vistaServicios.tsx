"use client"

import { motion } from "framer-motion"
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { TablaDetalle, type ColumnaTabla } from "../../_components/tablaDetalle"
import { ServicesResponse, COLORS, formatoMoneda } from "./tipos"

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
}

export function VistaServicios({ datos }: { datos: ServicesResponse }) {
  const filasTabla = datos.ranking.map((r) => ({
    servicio: r.name,
    citas: r.totalAppointments,
    ingresos: formatoMoneda(r.revenue),
    duracionPromedio: `${r.avgDurationMin} min`,
    tasaCancelacion: `${r.cancellationRate}%`,
    pctDelTotal: `${r.pctOfTotal}%`,
  }))

  const columnas: ColumnaTabla[] = [
    { key: "servicio", label: "Servicio" },
    { key: "citas", label: "Citas", align: "right" },
    { key: "ingresos", label: "Ingresos", align: "right" },
    { key: "duracionPromedio", label: "Duración prom.", align: "right" },
    { key: "tasaCancelacion", label: "% Cancelación", align: "right" },
    { key: "pctDelTotal", label: "% del total", align: "right" },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border/50 rounded-xl p-5"
        >
          <h2 className="font-semibold text-foreground mb-4">Ranking de servicios (citas)</h2>
          {datos.ranking.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(240, datos.ranking.length * 36)}>
              <BarChart data={datos.ranking} layout="vertical" margin={{ left: 16 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  width={110}
                />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="totalAppointments" radius={[0, 4, 4, 0]} fill="hsl(var(--primary))" name="Citas" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-10">Sin datos</p>
          )}
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card border border-border/50 rounded-xl p-5"
        >
          <h2 className="font-semibold text-foreground mb-4">Distribución de citas por servicio</h2>
          {datos.distribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={datos.distribution}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={({ percent }) => `${Math.round((percent ?? 0) * 100)}%`}
                >
                  {datos.distribution.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-10">Sin datos</p>
          )}
        </motion.section>
      </div>

      <TablaDetalle columnas={columnas} filas={filasTabla} titulo="Detalle por servicio" />
    </div>
  )
}
