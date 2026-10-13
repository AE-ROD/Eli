"use client"

import { motion, type Transition, type Variants } from "framer-motion"
import { Banknote, Check, CreditCard } from "lucide-react"
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

const PAGOS = [
  { medio: "Efectivo", monto: "$20.000", icono: Banknote, retraso: 0.2 },
  { medio: "Tarjeta de débito", monto: "$17.000", icono: CreditCard, retraso: 0.9 },
]

const POR_PROFESIONAL = [
  { nombre: "Lucía Pérez", monto: "$142.000", ancho: "w-full" },
  { nombre: "Carla", monto: "$118.000", ancho: "w-[83%]" },
  { nombre: "Ana", monto: "$96.000", ancho: "w-[68%]" },
]

// La historia del cobro: entra el efectivo y falta el resto; entra la
// tarjeta, lo que faltaba se va y aparece que los pagos cuadran.
const ENTRA: Variants = {
  reposo: { opacity: 0, y: 10, transition: VOLVER },
  activa: (retraso: number) => ({ opacity: 1, y: 0, transition: { delay: retraso, duration: 0.45, ease: CURVA.suave } }),
}
const FALTA: Variants = {
  reposo: { opacity: 0, transition: VOLVER },
  activa: { opacity: [0, 1, 1, 0], transition: { delay: 0.45, duration: 0.95, times: [0, 0.2, 0.8, 1], ease: "linear" } },
}
const CUADRA: Variants = {
  reposo: { opacity: 0, transition: VOLVER },
  activa: { opacity: 1, transition: { delay: 1.2, duration: 0.3, ease: CURVA.suave } },
}
const MARCA: Variants = {
  reposo: { scale: 0, transition: VOLVER },
  activa: { scale: 1, transition: { delay: 1.3, duration: 0.4, ease: CURVA.suave } },
}
const BARRA: Variants = {
  reposo: { scaleX: 0, transition: VOLVER },
  activa: (retraso: number) => ({ scaleX: 1, transition: { delay: retraso, duration: 0.7, ease: CURVA.suave } }),
}

/**
 * Un cobro de $37.000 dividido entre efectivo y tarjeta de débito, que
 * cuadra al centavo. Si la escena tiene lugar (576px de ancho), al lado va lo
 * cobrado en el día por cada profesional. Los datos son de ejemplo.
 */
export function MaquetaCobro({ activa }: PropsDeMaqueta) {
  return (
    <motion.div
      role="img"
      aria-label="Maqueta: un cobro de $37.000 dividido entre efectivo y tarjeta de débito, que cuadra"
      className="grid w-full items-start gap-3 @xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]"
      initial="reposo"
      animate={activa ? "activa" : "reposo"}
    >
      <div aria-hidden="true" className={MARCO}>
        <p className="text-sm font-semibold">Cobrar · María G.</p>
        <p className="mt-0.5 text-xs text-texto-2">Color + corte</p>
        <div className="mt-3 flex items-baseline justify-between gap-2">
          <span className="text-xs text-texto-2">Total</span>
          <span className="text-xl font-semibold tracking-[-0.5px]">$37.000</span>
        </div>

        {PAGOS.map((pago) => (
          <motion.div
            key={pago.medio}
            variants={ENTRA}
            custom={pago.retraso}
            className="mt-2 flex items-center gap-2.5 rounded-[12px] bg-superficie px-3 py-2.5"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-[8px] bg-tarjeta">
              <pago.icono className="size-4" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1 truncate">{pago.medio}</span>
            <span className="font-semibold">{pago.monto}</span>
          </motion.div>
        ))}

        <div className="mt-3 grid">
          <motion.div
            variants={FALTA}
            className="col-start-1 row-start-1 flex items-center justify-between gap-2 rounded-[12px] px-3 py-2.5 ring-1 ring-inset ring-borde"
          >
            <span className="text-texto-2">Falta cobrar</span>
            <span className="font-semibold">$17.000</span>
          </motion.div>
          <motion.div
            variants={CUADRA}
            className="col-start-1 row-start-1 flex items-center gap-2 rounded-[12px] bg-lima-suave px-3 py-2.5 font-semibold"
          >
            <motion.span variants={MARCA} className="grid size-[22px] shrink-0 place-items-center rounded-full bg-lima">
              <Check className="size-3.5" strokeWidth={2.25} />
            </motion.span>
            Los pagos cuadran
          </motion.div>
        </div>
      </div>

      <div aria-hidden="true" className={cn(MARCO, "hidden @xl:block")}>
        <p className="text-sm font-semibold">Hoy, por profesional</p>
        <p className="mt-0.5 text-xs text-texto-2">Cobrado: $356.000</p>
        {POR_PROFESIONAL.map((profesional, orden) => (
          <div key={profesional.nombre} className="mt-3">
            <div className="flex justify-between gap-2 text-xs">
              <span>{profesional.nombre}</span>
              <span className="font-semibold">{profesional.monto}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-superficie">
              <motion.span
                variants={BARRA}
                custom={0.3 + orden * 0.1}
                className={cn("block h-full origin-left rounded-full bg-lima", profesional.ancho)}
              />
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
