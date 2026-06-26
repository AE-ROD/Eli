"use client"

import { motion } from "framer-motion"
import { ClipboardCheck, AlertTriangle, DollarSign, Coins } from "lucide-react"
import { TarjetaKpi } from "../../_components/tarjetaKpi"
import { TablaDetalle, type ColumnaTabla } from "../../_components/tablaDetalle"
import { formatoMoneda } from "./tipos"

export interface ShiftClosesResponse {
  history: {
    id: string
    shiftDate: string
    shiftPeriod: string | null
    status: string
    closedByName: string | null
    reviewedByName: string | null
    appointmentsTotal: number
    appointmentsCompleted: number
    appointmentsCancelled: number
    appointmentsNoShow: number
    appointmentsPending: number
    expectedRevenue: number | null
    declaredRevenue: number | null
    discrepancy: number | null
    tipsTotal: number | null
  }[]
  totals: {
    totalCierres: number
    cierresConDiscrepanciaNegativa: number
    sumaDiscrepancias: number
    totalExpectedRevenue: number
    totalDeclaredRevenue: number
    totalTips: number
  }
}

const STATUS_LABEL: Record<string, string> = {
  BORRADOR: "Borrador",
  CERRADO: "Cerrado",
  REVISADO: "Revisado",
}

export function VistaCierres({ datos }: { datos: ShiftClosesResponse }) {
  const filasTabla = datos.history.map((c) => ({
    fecha: new Date(c.shiftDate).toLocaleDateString("es-MX"),
    periodo: c.shiftPeriod ?? "—",
    estado: STATUS_LABEL[c.status] ?? c.status,
    cerradoPor: c.closedByName ?? "—",
    esperado: c.expectedRevenue !== null ? formatoMoneda(c.expectedRevenue) : "—",
    declarado: c.declaredRevenue !== null ? formatoMoneda(c.declaredRevenue) : "—",
    discrepancia: c.discrepancy !== null ? formatoMoneda(c.discrepancy) : "—",
  }))

  const columnas: ColumnaTabla[] = [
    { key: "fecha", label: "Fecha" },
    { key: "periodo", label: "Periodo" },
    { key: "estado", label: "Estado" },
    { key: "cerradoPor", label: "Cerrado por" },
    { key: "esperado", label: "Esperado", align: "right" },
    { key: "declarado", label: "Declarado", align: "right" },
    { key: "discrepancia", label: "Discrepancia", align: "right" },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <TarjetaKpi label="Cierres en el período" valor={datos.totals.totalCierres} icono={ClipboardCheck} color="text-primary" />
        <TarjetaKpi
          label="Con discrepancia negativa"
          valor={datos.totals.cierresConDiscrepanciaNegativa}
          icono={AlertTriangle}
          color="text-destructive"
        />
        <TarjetaKpi label="Ingresos declarados" valor={formatoMoneda(datos.totals.totalDeclaredRevenue)} icono={DollarSign} color="text-amber-500" />
        <TarjetaKpi label="Propinas totales" valor={formatoMoneda(datos.totals.totalTips)} icono={Coins} color="text-emerald-500" />
      </div>

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border/50 rounded-xl p-5"
      >
        <p className="text-sm text-muted-foreground">
          Suma de discrepancias del período:{" "}
          <span
            className={`font-semibold tabular-nums ${datos.totals.sumaDiscrepancias < 0 ? "text-destructive" : "text-success"}`}
          >
            {formatoMoneda(datos.totals.sumaDiscrepancias)}
          </span>
        </p>
      </motion.section>

      <TablaDetalle columnas={columnas} filas={filasTabla} titulo="Historial de cierres de turno" />
    </div>
  )
}
