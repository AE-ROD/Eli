"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Users, ArrowRight } from "lucide-react"
import type { EstadisticasDelPanel } from "../_datos"

interface ResumenDeClientesProps {
  /** Nulo mientras cargan. */
  estadisticas: EstadisticasDelPanel | null
}

/** Cuántos clientes tiene el negocio y cuántos se sumaron este mes. */
export function ResumenDeClientes({ estadisticas }: ResumenDeClientesProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
    >
      <div className="bg-card border border-border/50 rounded-xl">
        <div className="flex items-center justify-between p-5 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100">
              <Users className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Clientes</h2>
              <p className="text-sm text-muted-foreground">
                {estadisticas ? `${estadisticas.totalClientes} en total` : "Cargando..."}
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/clientes"
            className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors"
          >
            Ver todos
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="p-5">
          {estadisticas && estadisticas.totalClientes === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Aún no tienes clientes registrados
            </p>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className="p-2 rounded-lg bg-primary/10">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  {estadisticas
                    ? `${estadisticas.totalClientes} ${estadisticas.totalClientes === 1 ? "cliente" : "clientes"}`
                    : "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {estadisticas && estadisticas.clientesNuevosMes > 0
                    ? `${estadisticas.clientesNuevosMes} desde el 1 de este mes`
                    : "Se suman al reservar"}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.section>
  )
}
