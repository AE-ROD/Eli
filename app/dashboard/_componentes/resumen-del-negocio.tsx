"use client"

import { useId } from "react"
import { FONDO_FUERTE } from "@/components/comunes/colores-de-modulo"
import { TARJETA_DEL_PANEL, TITULO_DE_TARJETA } from "@/components/panel/estilos"
import { formatearMonto } from "@/lib/dinero"
import { cn } from "@/lib/utils"
import { puedeVerIngresos, type EstadisticasDelPanel } from "../_datos"

interface ResumenDelNegocioProps {
  /** Nulo mientras cargan. */
  estadisticas: EstadisticasDelPanel | null
}

/** Las cifras del día y del mes en una lista corta, una por renglón, con el pastel del módulo de cada una. */
export function ResumenDelNegocio({ estadisticas }: ResumenDelNegocioProps) {
  const idDelTitulo = useId()
  const conIngresos = puedeVerIngresos(estadisticas)

  const renglones = [
    {
      etiqueta: "Citas hoy",
      valor: estadisticas?.citasHoy ?? "—",
      color: FONDO_FUERTE.azul,
    },
    {
      etiqueta: "Total clientes",
      valor: estadisticas?.totalClientes ?? "—",
      color: FONDO_FUERTE.lila,
    },
    // Sin cifras aún se muestra el guion; con las cifras cargadas, el renglón
    // se omite del todo si el endpoint no mandó ingresos.
    ...(!estadisticas || conIngresos
      ? [
          {
            etiqueta: "Ingresos este mes",
            valor: estadisticas ? formatearMonto(estadisticas.ingresosMes ?? 0) : "—",
            color: FONDO_FUERTE.lima,
          },
        ]
      : []),
    {
      etiqueta: "Clientes nuevos este mes",
      valor: estadisticas?.clientesNuevosMes ?? "—",
      color: FONDO_FUERTE.lila,
    },
  ]

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <h2 id={idDelTitulo} className={TITULO_DE_TARJETA}>
        {conIngresos ? "Resumen del negocio" : "Tu resumen"}
      </h2>
      <dl className="mt-4 divide-y divide-borde">
        {renglones.map((renglon) => (
          <div key={renglon.etiqueta} className="flex items-center justify-between gap-4 py-3 last:pb-0">
            <dt className="flex min-w-0 items-center gap-3 text-sm">
              <span aria-hidden="true" className={cn("size-2.5 shrink-0 rounded-full", renglon.color)} />
              {renglon.etiqueta}
            </dt>
            <dd className="shrink-0 text-sm font-semibold tabular-nums">{renglon.valor}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
