"use client"

import { motion } from "framer-motion"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import { Gauge, TrendingUp, TrendingDown, CalendarX } from "lucide-react"
import { TarjetaKpi } from "../../_components/tarjetaKpi"
import { OccupancyResponse } from "./tipos"

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
}

const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
const HORAS_VISIBLES = Array.from({ length: 24 }, (_, i) => i)

function colorIntensidad(rate: number, available: number): string {
  if (available === 0) return "transparent"
  if (rate === 0) return "hsl(var(--muted))"
  const alpha = Math.min(1, 0.15 + (rate / 100) * 0.85)
  return `hsl(var(--primary) / ${alpha})`
}

export function VistaOcupacion({ datos }: { datos: OccupancyResponse }) {
  const heatmapMap = new Map<string, { available: number; booked: number; rate: number }>()
  for (const h of datos.heatmap) {
    heatmapMap.set(`${h.dayOfWeek}-${h.hour}`, h)
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <TarjetaKpi label="Ocupación global" valor={`${datos.globalRate}%`} icono={Gauge} color="text-primary" />
        <TarjetaKpi
          label="Hora pico"
          valor={datos.peakHours[0] ? `${DIAS_CORTOS[datos.peakHours[0].dayOfWeek]} ${datos.peakHours[0].hour}:00` : "—"}
          icono={TrendingUp}
          color="text-success"
        />
        <TarjetaKpi
          label="Hora valle"
          valor={datos.quietHours[0] ? `${DIAS_CORTOS[datos.quietHours[0].dayOfWeek]} ${datos.quietHours[0].hour}:00` : "—"}
          icono={TrendingDown}
          color="text-destructive"
        />
      </div>

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border/50 rounded-xl p-5 overflow-x-auto"
      >
        <h2 className="font-semibold text-foreground mb-4">Mapa de calor: ocupación por día y hora</h2>
        <div className="min-w-[640px]">
          <div className="grid gap-1" style={{ gridTemplateColumns: "40px repeat(24, 1fr)" }}>
            <div />
            {HORAS_VISIBLES.map((h) => (
              <div key={h} className="text-[9px] text-muted-foreground text-center">
                {h}
              </div>
            ))}
            {DIAS_CORTOS.map((dia, dow) => (
              <>
                <div key={`label-${dow}`} className="text-[10px] text-muted-foreground flex items-center">
                  {dia}
                </div>
                {HORAS_VISIBLES.map((hour) => {
                  const celda = heatmapMap.get(`${dow}-${hour}`)
                  return (
                    <div
                      key={`${dow}-${hour}`}
                      className="aspect-square rounded-sm"
                      style={{ backgroundColor: colorIntensidad(celda?.rate ?? 0, celda?.available ?? 0) }}
                      title={
                        celda && celda.available > 0
                          ? `${dia} ${hour}:00 — ${celda.booked}/${celda.available} (${celda.rate}%)`
                          : "Sin disponibilidad"
                      }
                    />
                  )
                })}
              </>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-3">
          Intensidad de color = % de ocupación de ese bloque horario. Celdas vacías = sin horario laboral configurado.
        </p>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-card border border-border/50 rounded-xl p-5"
      >
        <h2 className="font-semibold text-foreground mb-4">Ocupación por día de la semana</h2>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={datos.byDayOfWeek}>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={36} />
            <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `${v}%`} />
            <Bar dataKey="rate" radius={[4, 4, 0, 0]} fill="hsl(var(--primary))" name="Ocupación" />
          </BarChart>
        </ResponsiveContainer>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-card border border-border/50 rounded-xl p-5 flex items-center gap-4"
      >
        <div className="p-3 rounded-xl bg-muted text-muted-foreground">
          <CalendarX className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Slots-hora desperdiciados en el período</p>
          <p className="text-2xl font-bold text-foreground tabular-nums">{datos.slotsWasted}</p>
        </div>
      </motion.section>
    </div>
  )
}
