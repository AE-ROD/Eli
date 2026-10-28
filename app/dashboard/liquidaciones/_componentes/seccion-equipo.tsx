"use client"

import { useId, useState } from "react"
import { AnimatePresence } from "framer-motion"
import { Calculator, Users } from "lucide-react"
import { Boton } from "@/components/comunes/boton"
import { EncabezadoDeTarjeta } from "@/components/panel/encabezado-de-tarjeta"
import { EstadoVacio } from "@/components/panel/estado-vacio"
import { TARJETA_DEL_PANEL } from "@/components/panel/estilos"
import { periodoParaLeer } from "@/lib/periodos-de-liquidacion"
import { cn } from "@/lib/utils"
import { ModalDeCierre } from "./modal-de-cierre"

export interface MiembroParaLiquidar {
  id: string
  nombre: string
  /** La última liquidación no anulada, si tiene. */
  ultima: { desde: string; hasta: string } | null
}

/**
 * El equipo con su última liquidación. La dueña abre la próxima de cada uno
 * (vista previa) y la cierra desde ahí; el encargado ve la lista.
 */
export function SeccionEquipo({ miembros, puedeCerrar }: { miembros: MiembroParaLiquidar[]; puedeCerrar: boolean }) {
  const idDelTitulo = useId()
  const [abierto, setAbierto] = useState<MiembroParaLiquidar | null>(null)

  return (
    <section aria-labelledby={idDelTitulo} className={cn(TARJETA_DEL_PANEL, "p-5 sm:p-6")}>
      <EncabezadoDeTarjeta
        id={idDelTitulo}
        titulo="Equipo"
        subtitulo={puedeCerrar ? "Revisa y cierra la próxima liquidación de cada uno" : "La última liquidación de cada uno"}
        icono={{ figura: Users }}
      />
      {miembros.length === 0 ? (
        <EstadoVacio className="mt-5">Todavía no hay nadie en el equipo.</EstadoVacio>
      ) : (
        <ul className="mt-5 divide-y divide-borde/60">
          {miembros.map((miembro) => (
            <li key={miembro.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium">{miembro.nombre}</p>
                <p className="text-sm text-texto-2">
                  {miembro.ultima
                    ? `Última: ${periodoParaLeer(miembro.ultima.desde, miembro.ultima.hasta)}`
                    : "Sin liquidaciones todavía"}
                </p>
              </div>
              {puedeCerrar && (
                <Boton variante="secundario" tamano="sm" icono={<Calculator />} onClick={() => setAbierto(miembro)}>
                  Próxima liquidación
                </Boton>
              )}
            </li>
          ))}
        </ul>
      )}

      <AnimatePresence>
        {abierto && <ModalDeCierre key={abierto.id} miembro={abierto} alCerrar={() => setAbierto(null)} />}
      </AnimatePresence>
    </section>
  )
}
