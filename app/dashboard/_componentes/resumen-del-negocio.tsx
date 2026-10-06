"use client"

import { motion } from "framer-motion"
import { puedeVerIngresos, type EstadisticasDelPanel } from "../_datos"

interface ResumenDelNegocioProps {
  /** Nulo mientras cargan. */
  estadisticas: EstadisticasDelPanel | null
}

/** Las cifras del día y del mes en una lista corta, una por renglón. */
export function ResumenDelNegocio({ estadisticas }: ResumenDelNegocioProps) {
  const conIngresos = puedeVerIngresos(estadisticas)

  const renglones = [
    {
      etiqueta: "Citas hoy",
      valor: estadisticas?.citasHoy ?? "—",
      color: "bg-primary",
    },
    {
      etiqueta: "Total clientes",
      valor: estadisticas?.totalClientes ?? "—",
      color: "bg-green-500",
    },
    // Sin cifras aún se muestra el guion; con las cifras cargadas, el renglón
    // se omite del todo si el endpoint no mandó ingresos.
    ...(!estadisticas || conIngresos
      ? [
          {
            etiqueta: "Ingresos este mes",
            valor: estadisticas ? `$${(estadisticas.ingresoseMes ?? 0).toLocaleString("es-ES")}` : "—",
            color: "bg-blue-500",
          },
        ]
      : []),
    {
      etiqueta: "Clientes nuevos este mes",
      valor: estadisticas?.clientesNuevosMes ?? "—",
      color: "bg-orange-500",
    },
  ]

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
    >
      <div className="bg-card border border-border/50 rounded-xl p-5">
        <h3 className="font-semibold text-foreground mb-4">
          {conIngresos ? "Resumen del negocio" : "Tu resumen"}
        </h3>
        <div className="space-y-4">
          {renglones.map((renglon, i) => (
            <motion.div
              key={renglon.etiqueta}
              className="flex items-center justify-between"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 + i * 0.1 }}
            >
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${renglon.color}`} />
                <span className="text-sm text-foreground">{renglon.etiqueta}</span>
              </div>
              <span className="text-sm font-semibold text-foreground">{renglon.valor}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.section>
  )
}
