"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Clock, ArrowRight } from "lucide-react"
import { TarjetaCita } from "@/components/panel/tarjeta-cita"
import type { CitaDelDia } from "@/lib/horario-dia"
import { citaParaTarjeta } from "./linea-de-tiempo-dia"

interface CitasDeHoyProps {
  /** Nulo mientras cargan las cifras del panel. */
  citas: CitaDelDia[] | null
  className?: string
}

/** La lista de citas de hoy, con el atajo a la agenda. */
export function CitasDeHoy({ citas, className }: CitasDeHoyProps) {
  return (
    <motion.section
      className={className}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <div className="bg-card border border-border/50 rounded-xl">
        <div className="flex items-center justify-between p-5 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Citas de hoy</h2>
              <p className="text-sm text-muted-foreground">
                {citas ? `${citas.length} citas programadas` : "Cargando..."}
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/agenda"
            className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors"
          >
            Ver agenda
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="p-5 space-y-3">
          {citas && citas.length > 0 ? (
            citas.map((cita) => <TarjetaCita key={cita.id} cita={citaParaTarjeta(cita)} compacta />)
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              {citas ? "Sin citas para hoy" : "Cargando citas..."}
            </p>
          )}
        </div>
      </div>
    </motion.section>
  )
}
