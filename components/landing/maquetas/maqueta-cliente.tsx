"use client"

import { motion, type Transition, type Variants } from "framer-motion"
import { NotebookPen } from "lucide-react"
import { CURVA, DURACION } from "@/components/movimiento/tiempos"
import { cn } from "@/lib/utils"

interface PropsDeMaqueta {
  /** Su paso está a la vista: corre la animación. Al dejar de estarlo, vuelve al principio. */
  activa: boolean
}

const MARCO =
  "w-full rounded-[24px] bg-tarjeta p-[18px] text-left text-[13px] leading-[1.35] text-navy shadow-md ring-1 ring-borde"

/** Vuelve al principio recién cuando terminó el fundido de salida: que no se la vea deshacerse. */
const VOLVER: Transition = { duration: 0, delay: DURACION.fundido }

/** La nota y las visitas entran de a una; el retraso de cada una va en `custom`. */
const ENTRA: Variants = {
  reposo: { opacity: 0, y: 10, transition: VOLVER },
  activa: (retraso: number) => ({ opacity: 1, y: 0, transition: { delay: retraso, duration: 0.5, ease: CURVA.suave } }),
}

const VISITAS = [
  { fecha: "12 sep", servicio: "Color + corte", profesionales: "Lucía Pérez y Carla", monto: "$37.000" },
  { fecha: "8 ago", servicio: "Corte", profesionales: "Carla", monto: "$15.000" },
  { fecha: "2 jul", servicio: "Peinado", profesionales: "Ana", monto: "$18.000" },
]

/** La ficha de un cliente: sus datos, una nota y sus últimas visitas. Los datos son de ejemplo. */
export function MaquetaCliente({ activa }: PropsDeMaqueta) {
  return (
    <motion.div
      role="img"
      aria-label="Maqueta: la ficha de María González, con una nota y sus últimas visitas"
      className={cn(MARCO, "max-w-[380px]")}
      initial="reposo"
      animate={activa ? "activa" : "reposo"}
    >
      <div aria-hidden="true">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-lila text-sm font-semibold">MG</span>
          <span className="min-w-0">
            <span className="block text-base font-semibold leading-tight">María González</span>
            <span className="block truncate text-xs text-texto-2">maria.gonzalez@correo.com</span>
          </span>
        </div>

        <div className="mt-3.5 grid grid-cols-2 gap-2">
          <Dato titulo="Visitas" valor="12" />
          <Dato titulo="Última visita" valor="12 sep" />
        </div>

        <motion.div
          variants={ENTRA}
          custom={0.15}
          className="mt-3 rounded-campo bg-lila-suave px-3 py-2.5 text-xs leading-[1.45]"
        >
          <span className="mb-0.5 flex items-center gap-1.5 font-semibold">
            <NotebookPen className="size-4" strokeWidth={1.75} />
            Nota
          </span>
          Prefiere tonos fríos en el color. Pide hora temprano.
        </motion.div>

        <p className="mb-1 mt-3.5 text-xs font-semibold">Últimas visitas</p>
        {VISITAS.map((visita, orden) => (
          <motion.div
            key={visita.fecha}
            variants={ENTRA}
            custom={0.3 + orden * 0.12}
            className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-borde py-2"
          >
            <span className="text-xs text-texto-2">{visita.fecha}</span>
            <span className="min-w-0">
              <span className="block truncate font-medium">{visita.servicio}</span>
              <span className="block truncate text-xs text-texto-2">{visita.profesionales}</span>
            </span>
            <span className="font-semibold">{visita.monto}</span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <span className="rounded-[12px] bg-superficie px-2.5 py-2">
      <span className="block text-xs text-texto-2">{titulo}</span>
      <span className="font-semibold">{valor}</span>
    </span>
  )
}
