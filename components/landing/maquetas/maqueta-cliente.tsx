"use client"

import { motion, type Transition, type Variants } from "framer-motion"
import { CURVA, DURACION } from "@/components/movimiento/tiempos"
import { Avatar, TARJETA_DE_MAQUETA } from "@/components/landing/maquetas/maqueta-piezas"
import { cn } from "@/lib/utils"

interface PropsDeMaqueta {
  /** Su paso está a la vista: corre la animación. Al dejar de estarlo, vuelve al principio. */
  activa: boolean
}

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
]

/** La ficha de una clienta: sus datos, una nota y sus últimas visitas. Los datos son de ejemplo. */
export function MaquetaCliente({ activa }: PropsDeMaqueta) {
  return (
    <motion.div
      role="img"
      aria-label="Maqueta: la ficha de María González, con 12 visitas, una nota y sus últimas visitas"
      className={cn(TARJETA_DE_MAQUETA, "w-full max-w-[440px] p-4 @sm:p-5")}
      initial="reposo"
      animate={activa ? "activa" : "reposo"}
    >
      <div aria-hidden="true">
        <div className="flex items-center gap-3.5">
          <Avatar tono="frambuesa" tamano="xl" className="max-[400px]:size-11 max-[400px]:text-base">
            MG
          </Avatar>
          <span className="min-w-0">
            <span className="block text-lg font-semibold leading-tight tracking-[-0.02em]">María González</span>
            <span className="block truncate text-[13px] text-texto-2">maria.gonzalez@correo.com</span>
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <Dato titulo="Visitas" valor="12" />
          <Dato titulo="Última visita" valor="12 sep" />
        </div>

        <motion.div variants={ENTRA} custom={0.15} className="mt-3 rounded-[14px] bg-frambuesa-suave px-3.5 py-3">
          <p className="text-xs font-bold text-frambuesa-texto">Nota</p>
          <p className="mt-0.5 text-sm leading-[1.45]">Prefiere tonos fríos en el color. Pide hora temprano.</p>
        </motion.div>

        <p className="mt-3.5 text-[13px] font-bold">Últimas visitas</p>
        <div className="mt-1">
          {VISITAS.map((visita, orden) => (
            <motion.div
              key={visita.fecha}
              variants={ENTRA}
              custom={0.3 + orden * 0.12}
              className="flex items-center gap-3 border-t border-borde-suave py-2.5"
            >
              <span className="w-11 shrink-0 text-xs text-texto-2">{visita.fecha}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{visita.servicio}</span>
                <span className="block truncate text-xs text-texto-2">{visita.profesionales}</span>
              </span>
              <span className="text-sm font-semibold">{visita.monto}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

function Dato({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <span className="rounded-[14px] border border-borde-suave bg-crema px-3.5 py-[11px]">
      <span className="block text-xs text-texto-2">{titulo}</span>
      <span className="block text-2xl font-semibold tracking-[-0.03em]">{valor}</span>
    </span>
  )
}
