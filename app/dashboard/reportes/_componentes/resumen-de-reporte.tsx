"use client"

import { useId, type ReactNode } from "react"
import { DollarSign, Receipt, TrendingUp, type LucideIcon } from "lucide-react"
import { formatearMonto } from "@/lib/dinero"
import type { Reporte } from "../_datos"

function Cifra({ titulo, valor, icono: Icono }: { titulo: string; valor: string; icono: LucideIcon }) {
  return (
    <div className="bg-card border border-border/50 rounded-xl p-5 flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <p className="text-sm text-muted-foreground">{titulo}</p>
        <p className="text-2xl font-bold text-foreground tabular-nums">{valor}</p>
      </div>
      <div className="p-3 rounded-lg shrink-0 bg-primary/10 text-primary">
        <Icono className="h-5 w-5" aria-hidden="true" />
      </div>
    </div>
  )
}

interface Renglon {
  clave: string
  nombre: ReactNode
  detalle?: string
  monto: number
}

function Desglose({ titulo, renglones }: { titulo: string; renglones: Renglon[] }) {
  const idDelTitulo = useId()
  return (
    <section aria-labelledby={idDelTitulo} className="bg-card border border-border/50 rounded-xl p-5">
      <h2 id={idDelTitulo} className="font-semibold text-foreground mb-3">
        {titulo}
      </h2>
      {renglones.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin cobros en este período.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {renglones.map((renglon) => (
            <li key={renglon.clave} className="flex items-baseline justify-between gap-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="text-foreground">{renglon.nombre}</span>
                {renglon.detalle && <span className="block text-xs text-muted-foreground">{renglon.detalle}</span>}
              </span>
              <span className="font-semibold text-foreground tabular-nums shrink-0">{formatearMonto(renglon.monto)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const cuantos = (cantidad: number, singular: string, plural: string) =>
  `${cantidad} ${cantidad === 1 ? singular : plural}`

/** Lo que ya no está en el catálogo o en el equipo se sigue viendo, marcado. */
function conMarca(nombre: string, sigue: boolean, marca: string): ReactNode {
  if (sigue) return nombre
  return (
    <>
      {nombre} <span className="text-xs text-muted-foreground">({marca})</span>
    </>
  )
}

/**
 * Las cifras del período y su desglose. Al profesional (`alcance: "propio"`)
 * todo le habla en segunda persona, porque son sus números y no los del
 * negocio: lo que atendió, sin totales del local ni medios de pago.
 */
export function ResumenDeReporte({ reporte }: { reporte: Reporte }) {
  const { resumen, alcance } = reporte
  const propio = alcance === "propio"

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Cifra titulo={propio ? "Lo que atendiste" : "Ingresos"} valor={formatearMonto(resumen.ingresos)} icono={DollarSign} />
        <Cifra titulo={propio ? "Tus atenciones" : "Atenciones"} valor={String(resumen.cantidad)} icono={Receipt} />
        <Cifra
          titulo={propio ? "Tu promedio por atención" : "Ticket promedio"}
          valor={resumen.ticketPromedio === null ? "—" : formatearMonto(resumen.ticketPromedio)}
          icono={TrendingUp}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Al profesional, el desglose por profesional sería una sola fila: la suya, que ya está arriba. */}
        {!propio && (
          <Desglose
            titulo="Por profesional"
            renglones={resumen.porProfesional.map((grupo) => ({
              clave: grupo.clave,
              nombre: conMarca(grupo.nombre, grupo.id !== null, "ya no está en el equipo"),
              detalle: cuantos(grupo.servicios, "servicio", "servicios"),
              monto: grupo.monto,
            }))}
          />
        )}
        <Desglose
          titulo={propio ? "Lo que atendiste, por servicio" : "Por servicio"}
          renglones={resumen.porServicio.map((grupo) => ({
            clave: grupo.clave,
            nombre: conMarca(grupo.nombre, grupo.id !== null, "fuera del catálogo"),
            detalle: cuantos(grupo.cantidad, "vez", "veces"),
            monto: grupo.monto,
          }))}
        />
        {resumen.porMedio && (
          <Desglose
            titulo="Por medio de pago"
            renglones={resumen.porMedio.map((grupo) => ({ clave: grupo.medio, nombre: grupo.nombre, monto: grupo.monto }))}
          />
        )}
      </div>
    </div>
  )
}
