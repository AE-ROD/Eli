"use client"

import { motion } from "framer-motion"
import { formatearHora } from "@/lib/fechas"
import type { CitaDelDia } from "@/lib/horario-dia"

interface CitasPorHoraProps {
  /** Nulo mientras cargan las cifras del panel. */
  citas: CitaDelDia[] | null
}

/** Las citas de hoy en fila por hora de inicio: quién viene y a qué. */
export function CitasPorHora({ citas }: CitasPorHoraProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
    >
      <div className="bg-card border border-border/50 rounded-xl p-5">
        <h3 className="font-semibold text-foreground mb-4">Citas de hoy por hora</h3>
        {citas && citas.length > 0 ? (
          <div className="space-y-3">
            {citas.map((cita) => (
              <div key={cita.id} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-12 flex-shrink-0">
                  {formatearHora(cita.startTime)}
                </span>
                <div className="flex-1 h-7 bg-primary/10 rounded-lg flex items-center px-3">
                  <span className="text-xs font-medium text-primary truncate">
                    {cita.customer?.name ?? "Sin cliente"} — {cita.title}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            {citas ? "Sin citas para hoy" : "Cargando..."}
          </div>
        )}
      </div>
    </motion.section>
  )
}
