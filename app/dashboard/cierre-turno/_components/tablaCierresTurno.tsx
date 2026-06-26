"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { BadgeEstadoCierre } from "./badgeEstadoCierre"
import { numero, type CierreTurnoAPI } from "./tipos"

interface TablaCierresTurnoProps {
  cierres: CierreTurnoAPI[]
  cargando: boolean
  onSeleccionar: (cierre: CierreTurnoAPI) => void
}

function formatearFecha(fechaStr: string) {
  return new Date(fechaStr).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function formatearMonto(valor: number) {
  return valor.toLocaleString("es-MX", { style: "currency", currency: "MXN" })
}

export function TablaCierresTurno({ cierres, cargando, onSeleccionar }: TablaCierresTurnoProps) {
  if (cargando) {
    return <div className="py-12 text-center text-muted-foreground">Cargando cierres...</div>
  }

  if (cierres.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        No hay cierres de turno registrados todavía.
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Período</TableHead>
            <TableHead>Responsable</TableHead>
            <TableHead>Citas</TableHead>
            <TableHead>Declarado</TableHead>
            <TableHead>Estado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cierres.map((cierre) => (
            <TableRow
              key={cierre.id}
              className="cursor-pointer"
              onClick={() => onSeleccionar(cierre)}
            >
              <TableCell>{formatearFecha(cierre.shiftDate)}</TableCell>
              <TableCell>{cierre.shiftPeriod ?? "—"}</TableCell>
              <TableCell>{cierre.closedBy?.user?.name ?? "—"}</TableCell>
              <TableCell>
                {cierre.appointmentsCompleted}/{cierre.appointmentsTotal}
              </TableCell>
              <TableCell>
                {cierre.declaredRevenue !== null
                  ? formatearMonto(numero(cierre.declaredRevenue))
                  : "—"}
              </TableCell>
              <TableCell>
                <BadgeEstadoCierre estado={cierre.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
