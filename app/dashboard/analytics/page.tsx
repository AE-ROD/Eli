"use client"

import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { BarraSuperior } from "@/components/app/layout/barra-superior"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts"
import { TrendingUp, Users, CalendarCheck, DollarSign } from "lucide-react"

interface AnalyticsData {
  semanas: { label: string; citas: number }[]
  serviciosPopulares: { nombre: string; citas: number }[]
  totalCitas: number
  totalPacientes: number
  ingresosMes: number
}

const COLORS = ["hsl(var(--primary))", "hsl(var(--primary)/0.8)", "hsl(var(--primary)/0.65)", "hsl(var(--primary)/0.5)", "hsl(var(--primary)/0.35)"]

export default function AnalyticsPage() {
  const [datos, setDatos] = useState<AnalyticsData | null>(null)

  useEffect(() => {
    fetch("/api/dashboard/analytics")
      .then((r) => r.json())
      .then(setDatos)
      .catch(console.error)
  }, [])

  const maxCitas = datos ? Math.max(...datos.semanas.map((s) => s.citas), 1) : 1

  return (
    <div className="min-h-screen">
      <BarraSuperior titulo="Analítica" subtitulo="Tendencias y métricas de tu negocio" />

      <div className="p-6 space-y-6">
        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Citas totales", valor: datos?.totalCitas ?? "—", icono: CalendarCheck, color: "text-primary" },
            { label: "Pacientes", valor: datos?.totalPacientes ?? "—", icono: Users, color: "text-emerald-500" },
            { label: "Ingresos del mes", valor: datos ? `$${datos.ingresosMes.toLocaleString("es-MX")}` : "—", icono: DollarSign, color: "text-amber-500" },
          ].map((kpi, i) => (
            <motion.div
              key={kpi.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              className="bg-card border border-border/50 rounded-xl p-5 flex items-center gap-4"
            >
              <div className={`p-3 rounded-xl bg-muted ${kpi.color}`}>
                <kpi.icono className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className="text-2xl font-bold text-foreground">{kpi.valor}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Weekly chart */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card border border-border/50 rounded-xl p-5"
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 rounded-lg bg-primary/10">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Citas por semana</h2>
              <p className="text-xs text-muted-foreground">Últimas 8 semanas</p>
            </div>
          </div>

          {datos ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={datos.semanas} barCategoryGap="30%">
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  width={24}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  cursor={{ fill: "hsl(var(--muted)/0.5)" }}
                  formatter={(v: number) => [`${v} citas`, "Citas"]}
                />
                <Bar dataKey="citas" radius={[4, 4, 0, 0]}>
                  {datos.semanas.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.citas === maxCitas ? "hsl(var(--primary))" : "hsl(var(--primary)/0.45)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
              Cargando datos...
            </div>
          )}
        </motion.section>

        {/* Popular services */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card border border-border/50 rounded-xl p-5"
        >
          <h2 className="font-semibold text-foreground mb-4">Servicios más populares</h2>
          {datos?.serviciosPopulares.length ? (
            <div className="space-y-3">
              {datos.serviciosPopulares.map((s, i) => {
                const pct = Math.round((s.citas / datos.serviciosPopulares[0].citas) * 100)
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-sm text-foreground w-36 truncate flex-shrink-0">{s.nombre}</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: COLORS[i] ?? COLORS[4] }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.6, delay: 0.35 + i * 0.06 }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-12 text-right flex-shrink-0 tabular-nums">
                      {s.citas} cita{s.citas !== 1 ? "s" : ""}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">
              {datos ? "Sin datos suficientes aún" : "Cargando..."}
            </p>
          )}
        </motion.section>
      </div>
    </div>
  )
}
