"use client"

import { motion } from "framer-motion"
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { UserCircle, UserPlus, Repeat, Percent } from "lucide-react"
import { TarjetaKpi } from "../../_components/tarjetaKpi"
import { TablaDetalle, type ColumnaTabla } from "../../_components/tablaDetalle"
import { PatientsResponse, formatoMoneda, formatoFechaCorta } from "./tipos"

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
}

export function VistaClientes({ datos }: { datos: PatientsResponse }) {
  const columnasTop: ColumnaTabla[] = [
    { key: "name", label: "Cliente" },
    { key: "visits", label: "Visitas", align: "right" },
    { key: "revenue", label: "Ingresos", align: "right", formato: (v) => formatoMoneda(Number(v) || 0) },
  ]

  const columnasInactivos: ColumnaTabla[] = [
    { key: "name", label: "Cliente" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Teléfono" },
    {
      key: "lastVisit",
      label: "Última visita",
      formato: (v) => (v ? new Date(String(v)).toLocaleDateString("es-MX") : "Nunca"),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <TarjetaKpi label="Clientes activos" valor={datos.summary.totalActive} icono={UserCircle} color="text-sky-500" />
        <TarjetaKpi label="Nuevos en el período" valor={datos.summary.newInPeriod} icono={UserPlus} color="text-emerald-500" />
        <TarjetaKpi label="Recurrentes (>1 cita)" valor={datos.summary.recurrent} icono={Repeat} color="text-violet-500" />
        <TarjetaKpi label="Tasa de retención" valor={`${datos.summary.retentionRate}%`} icono={Percent} color="text-amber-500" />
      </div>

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border/50 rounded-xl p-5"
      >
        <h2 className="font-semibold text-foreground mb-4">Nuevos clientes en el tiempo</h2>
        {datos.timeSeries.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={datos.timeSeries.map((t) => ({ ...t, label: formatoFechaCorta(t.date) }))}>
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={30} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="newPatients" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Nuevos clientes" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-10">Sin datos para el período seleccionado</p>
        )}
      </motion.section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TablaDetalle columnas={columnasTop} filas={datos.topByVisits} titulo="Top clientes por visitas" porPagina={5} />
        <TablaDetalle columnas={columnasTop} filas={datos.topByRevenue} titulo="Top clientes por ingresos" porPagina={5} />
      </div>

      <TablaDetalle
        columnas={columnasInactivos}
        filas={datos.inactive}
        titulo={`Clientes inactivos (${datos.inactive.length})`}
      />
    </div>
  )
}
