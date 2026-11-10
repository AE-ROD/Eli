"use client"

import { motion, type Transition, type Variants } from "framer-motion"
import { Check } from "lucide-react"
import { CURVA, DURACION } from "@/components/movimiento/tiempos"
import { TARJETA_DE_MAQUETA } from "@/components/landing/maquetas/maqueta-piezas"
import { formatearPesos } from "@/lib/precios"
import { cn } from "@/lib/utils"

interface PropsDeMaqueta {
  /** Su paso está a la vista: corre la animación. Al dejar de estarlo, vuelve al principio. */
  activa: boolean
}

/** Vuelve al principio recién cuando terminó el fundido de salida: que no se la vea deshacerse. */
const VOLVER: Transition = { duration: 0, delay: DURACION.fundido }

/** Lo cobrado hoy por cada profesional. La barra más larga es la del monto mayor. */
const POR_PROFESIONAL = [
  { nombre: "Lucía Pérez", monto: 142000, barra: "bg-ciruela" },
  { nombre: "Carla", monto: 118000, barra: "bg-frambuesa" },
  { nombre: "Ana", monto: 96000, barra: "bg-pistacho" },
] as const

const COBRADO_HOY = POR_PROFESIONAL.reduce((suma, profesional) => suma + profesional.monto, 0)
const MAYOR = Math.max(...POR_PROFESIONAL.map((profesional) => profesional.monto))

// La historia del cobro: entra el efectivo y falta el resto; entra el
// débito, lo que faltaba se va y aparece que los pagos cuadran.
const ENTRA: Variants = {
  reposo: { opacity: 0, y: 8, transition: VOLVER },
  activa: (retraso: number) => ({ opacity: 1, y: 0, transition: { delay: retraso, duration: 0.45, ease: CURVA.suave } }),
}
const FALTA: Variants = {
  reposo: { opacity: 0, transition: VOLVER },
  activa: { opacity: [0, 1, 1, 0], transition: { delay: 0.45, duration: 1.1, times: [0, 0.2, 0.8, 1], ease: "linear" } },
}
const CUADRA: Variants = {
  reposo: { opacity: 0, transition: VOLVER },
  activa: { opacity: 1, transition: { delay: 1.45, duration: 0.3, ease: CURVA.suave } },
}
const BARRA: Variants = {
  reposo: { scaleX: 0, transition: VOLVER },
  activa: (retraso: number) => ({ scaleX: 1, transition: { delay: retraso, duration: 0.7, ease: CURVA.suave } }),
}

const FILA = "flex justify-between gap-2 border-t border-borde-suave py-[9px] text-sm"

/**
 * Un cobro de $37.000 dividido entre efectivo y débito, que cuadra al
 * centavo. Si el contenedor tiene lugar (576px de ancho), al lado va lo
 * cobrado en el día por cada profesional. Los datos son de ejemplo.
 */
export function MaquetaCobro({ activa }: PropsDeMaqueta) {
  return (
    // Cada tarjeta se describe sola: la de lo cobrado por profesional sólo se
    // ve con lugar (`@xl`), y oculta no se anuncia.
    <motion.div
      className="flex w-full max-w-[600px] items-stretch justify-center gap-3.5"
      initial="reposo"
      animate={activa ? "activa" : "reposo"}
    >
      <div
        role="img"
        aria-label="Maqueta: el cobro de María G., color + corte por $37.000, dividido entre efectivo ($20.000) y débito ($17.000), que cuadra al centavo"
        className={cn(TARJETA_DE_MAQUETA, "w-full max-w-[300px] p-5 @xl:w-[250px] @xl:flex-none")}
      >
        <p className="text-[13px] text-texto-2">Cobrar · María G.</p>
        <p className="mt-0.5 text-[17px] font-semibold tracking-[-0.02em]">Color + corte</p>
        <div className="mt-2.5">
          <div className={FILA}>
            <span>Total</span>
            <span className="font-semibold">$37.000</span>
          </div>
          <motion.div variants={ENTRA} custom={0.2} className={FILA}>
            <span>Efectivo</span>
            <span className="font-semibold">$20.000</span>
          </motion.div>
          <motion.div variants={ENTRA} custom={1.2} className={FILA}>
            <span>Débito</span>
            <span className="font-semibold">$17.000</span>
          </motion.div>
          <div className="grid border-t border-borde-suave">
            <motion.div
              variants={FALTA}
              className="col-start-1 row-start-1 flex justify-between gap-2 py-[9px] text-sm font-semibold text-frambuesa-texto"
            >
              <span>Falta cobrar</span>
              <span>$17.000</span>
            </motion.div>
            <motion.div
              variants={CUADRA}
              className="col-start-1 row-start-1 flex items-center gap-2 py-[9px] text-sm font-semibold text-pistacho-texto"
            >
              <span className="grid size-5 place-items-center rounded-full bg-pistacho text-navy">
                <Check className="size-3" strokeWidth={2.5} />
              </span>
              Cuadra al centavo
            </motion.div>
          </div>
        </div>
        <div className="mt-3 grid h-[42px] place-items-center rounded-[14px] bg-navy text-sm font-semibold text-white">
          Cobrar
        </div>
      </div>

      <div
        role="img"
        aria-label={`Maqueta: lo cobrado hoy por profesional, ${formatearPesos(COBRADO_HOY)} en total: ${POR_PROFESIONAL.map((profesional) => `${profesional.nombre}, ${formatearPesos(profesional.monto)}`).join("; ")}`}
        className={cn(TARJETA_DE_MAQUETA, "hidden min-w-0 flex-1 p-5 @xl:block")}
      >
        <p className="text-[13px] text-texto-2">Hoy, por profesional</p>
        <p className="mt-0.5 text-[22px] font-semibold tracking-[-0.03em]">Cobrado: {formatearPesos(COBRADO_HOY)}</p>
        {POR_PROFESIONAL.map((profesional, orden) => (
          <div key={profesional.nombre} className="mt-3">
            <div className="flex justify-between gap-2 text-[13px]">
              <span className="font-semibold">{profesional.nombre}</span>
              <span>{formatearPesos(profesional.monto)}</span>
            </div>
            <div className="mt-[5px] h-2 overflow-hidden rounded-full bg-borde-suave">
              <motion.span
                variants={BARRA}
                custom={0.3 + orden * 0.1}
                className={cn("block h-full origin-left rounded-full", profesional.barra)}
                style={{ width: `${(profesional.monto / MAYOR) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
