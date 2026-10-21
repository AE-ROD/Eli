"use client"

import { useId } from "react"
import { Clock } from "lucide-react"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { EstadoVacio } from "@/components/panel/estado-vacio"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { formatearHora } from "@/lib/fechas"
import type { CitaDelDia } from "@/lib/horario-dia"
import { cn } from "@/lib/utils"

interface PropsDeCitasPorHora {
  /** Nulo mientras cargan las cifras del panel. */
  citas: CitaDelDia[] | null
}

/** Las citas de hoy en fila por hora de inicio: quién viene y a qué. */
export function CitasPorHora({ citas }: PropsDeCitasPorHora) {
  const idDelTitulo = useId()

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta id={idDelTitulo} titulo="Citas de hoy por hora" icono={{ figura: Clock, color: "azul" }} />

      <div className="mt-5">
        {citas && citas.length > 0 ? (
          <ul className="space-y-2">
            {citas.map((cita) => (
              <li key={cita.id} className="flex items-center gap-3">
                <span className="w-12 shrink-0 text-xs text-texto-2 tabular-nums">{formatearHora(cita.startTime)}</span>
                {/* `min-w-0`: sin él, un nombre largo ensanchaba la fila más allá de la pantalla en vez de cortarse. */}
                <span className="flex h-8 min-w-0 flex-1 items-center rounded-[12px] bg-azul-suave px-3 squircle">
                  <span className="truncate text-xs font-medium text-navy">
                    {cita.customer?.name ?? "Sin cliente"} — {cita.title}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EstadoVacio>{citas ? "Sin citas para hoy" : "Cargando..."}</EstadoVacio>
        )}
      </div>
    </section>
  )
}
