"use client"

import { useId, useState } from "react"
import Link from "next/link"
import { ChevronRight, History } from "lucide-react"
import { Selector } from "@/components/comunes/selector"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { EstadoVacio } from "@/components/panel/estado-vacio"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import type { ResumenDeLiquidacion } from "@/lib/liquidacion"
import { cn } from "@/lib/utils"
import { InsigniaDeEstado, pesos } from "./piezas"

/**
 * Las liquidaciones cerradas, pagadas y anuladas, de la más nueva a la más
 * vieja, con su comprobante. Se puede mirar una sola persona.
 */
export function HistorialDeLiquidaciones({ liquidaciones }: { liquidaciones: ResumenDeLiquidacion[] }) {
  const idDelTitulo = useId()
  const [miembro, setMiembro] = useState("")
  const personas = [...new Map(liquidaciones.map((l) => [l.memberId, l.miembro])).entries()]
  const visibles = miembro ? liquidaciones.filter((l) => l.memberId === miembro) : liquidaciones

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta id={idDelTitulo} titulo="Historial" subtitulo="Cada liquidación con su comprobante" icono={{ figura: History }} />
      {liquidaciones.length === 0 ? (
        <EstadoVacio className="mt-5">Todavía no se cerró ninguna liquidación.</EstadoVacio>
      ) : (
        <>
          {personas.length > 1 && (
            <div className="mt-5 max-w-xs">
              <Selector
                etiqueta="Profesional"
                value={miembro}
                onChange={(evento) => setMiembro(evento.target.value)}
                opciones={personas.map(([id, nombre]) => ({ valor: id, texto: nombre }))}
              >
                <option value="">Todos</option>
              </Selector>
            </div>
          )}
          <ul className="mt-4 divide-y divide-borde/60">
            {visibles.map((liquidacion) => (
              <li key={liquidacion.id}>
                <Link
                  href={`/dashboard/liquidaciones/${liquidacion.id}`}
                  className="anillo-foco -mx-2 flex min-h-11 items-center gap-3 rounded-campo px-2 py-3 hover:bg-superficie"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{liquidacion.miembro}</p>
                    <p className="text-sm text-texto-2">{liquidacion.texto}</p>
                  </div>
                  <InsigniaDeEstado estado={liquidacion.estado} />
                  <span className={cn("tabular-nums font-medium", liquidacion.estado === "anulada" && "text-texto-2 line-through")}>
                    {pesos(liquidacion.totalCents)}
                  </span>
                  <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-texto-2" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
