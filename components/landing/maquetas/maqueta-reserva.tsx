"use client"

import { motion, type Transition, type Variants } from "framer-motion"
import { ChevronLeft, ChevronRight } from "lucide-react"
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

const DIAS_DE_LA_SEMANA = ["L", "M", "M", "J", "V", "S", "D"]
/** Octubre de 2026 empieza un jueves: tres huecos antes del 1. */
const HUECOS_ANTES_DEL_1 = 3
const DIAS_DEL_MES = 31
const HOY = 12
const DIA_ELEGIDO = 15
const HORARIOS = ["09:30", "10:30", "11:00", "12:30", "15:00", "16:30"]
const HORARIO_ELEGIDO = "10:30"

// Primero se marca el día, después la hora, y al final se aprieta el botón.
const MARCA_DEL_DIA: Variants = {
  reposo: { scale: 0, transition: VOLVER },
  activa: { scale: 1, transition: { delay: 0.5, duration: 0.35, ease: CURVA.suave } },
}
const NUMERO_DEL_DIA: Variants = {
  reposo: { opacity: 0, transition: VOLVER },
  activa: { opacity: 1, transition: { delay: 0.6, duration: 0.2, ease: CURVA.suave } },
}
const HORA: Variants = {
  reposo: { opacity: 0, transition: VOLVER },
  activa: { opacity: 1, transition: { delay: 1.1, duration: 0.25, ease: CURVA.suave } },
}
const BOTON: Variants = {
  reposo: { scale: 1, transition: VOLVER },
  activa: { scale: [1, 0.95, 1], transition: { delay: 1.7, duration: 0.7, ease: CURVA.suave } },
}

/**
 * La página pública de reservas en el paso 2 de 3: el servicio ya elegido,
 * un calendario que marca el jueves 15 y después las 10:30, y el botón para
 * confirmar. Los datos son de ejemplo.
 */
export function MaquetaReserva({ activa }: PropsDeMaqueta) {
  return (
    <motion.div
      role="img"
      aria-label="Maqueta: la página de reservas con el jueves 15 y las 10:30 elegidos"
      className={cn(MARCO, "max-w-[360px]")}
      initial="reposo"
      animate={activa ? "activa" : "reposo"}
    >
      <div aria-hidden="true">
        <div className="flex items-center justify-between gap-2.5">
          <span className="text-sm font-semibold">Reservar</span>
          <span className="text-xs text-texto-2">Paso 2 de 3 · Día y hora</span>
        </div>
        <div className="mb-0.5 mt-2.5 flex gap-1.5">
          <span className="h-1 flex-1 rounded-full bg-navy" />
          <span className="h-1 flex-1 rounded-full bg-navy" />
          <span className="h-1 flex-1 rounded-full bg-borde" />
        </div>

        <div className="mt-2.5 flex items-center justify-between gap-2.5 rounded-[12px] bg-superficie px-3 py-2 font-semibold">
          <span>Color + corte</span>
          <span>$37.000</span>
        </div>

        <div className="mt-2.5 flex items-center justify-between">
          <span className="font-semibold">Octubre de 2026</span>
          <span className="flex gap-1 text-texto-2">
            <ChevronLeft className="size-3.5" strokeWidth={1.75} />
            <ChevronRight className="size-3.5" strokeWidth={1.75} />
          </span>
        </div>
        <div className="mt-1.5 grid grid-cols-7 gap-0.5 text-center">
          {DIAS_DE_LA_SEMANA.map((dia, orden) => (
            <span key={orden} className="py-[3px] text-[11px] text-texto-2">
              {dia}
            </span>
          ))}
          {Array.from({ length: HUECOS_ANTES_DEL_1 }, (_, orden) => (
            <span key={`hueco-${orden}`} />
          ))}
          {Array.from({ length: DIAS_DEL_MES }, (_, orden) => {
            const dia = orden + 1
            if (dia === DIA_ELEGIDO) {
              return (
                <span key={dia} className="relative grid h-[26px] place-items-center text-xs">
                  <motion.span variants={MARCA_DEL_DIA} className="absolute inset-x-[3px] inset-y-px rounded-[10px] bg-navy" />
                  <span className="relative">{dia}</span>
                  <motion.span
                    variants={NUMERO_DEL_DIA}
                    className="absolute inset-0 grid place-items-center font-semibold text-white"
                  >
                    {dia}
                  </motion.span>
                </span>
              )
            }
            return (
              <span
                key={dia}
                className={cn(
                  "grid h-[26px] place-items-center text-xs",
                  dia < HOY && "text-texto-2/70",
                  dia === HOY && "underline underline-offset-[3px]"
                )}
              >
                {dia}
              </span>
            )
          })}
        </div>

        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          {HORARIOS.map((hora) => {
            const elegida = hora === HORARIO_ELEGIDO
            return (
              <span
                key={hora}
                className="relative grid h-7 place-items-center overflow-hidden rounded-[10px] text-xs font-medium ring-1 ring-inset ring-borde"
              >
                {elegida && <motion.span variants={HORA} className="absolute inset-0 bg-navy" />}
                <span className="relative">{hora}</span>
                {elegida && (
                  <motion.span variants={HORA} className="absolute inset-0 grid place-items-center text-white">
                    {hora}
                  </motion.span>
                )}
              </span>
            )
          })}
        </div>

        <motion.div
          variants={BOTON}
          className="mt-3 grid h-8 place-items-center rounded-[12px] bg-navy text-[13px] font-medium text-white"
        >
          Confirmar reserva
        </motion.div>
      </div>
    </motion.div>
  )
}
