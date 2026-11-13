"use client"

import { motion, type Transition, type Variants } from "framer-motion"
import { CURVA, DURACION } from "@/components/movimiento/tiempos"
import { TARJETA_DE_MAQUETA } from "@/components/landing/maquetas/maqueta-piezas"
import { cn } from "@/lib/utils"

interface PropsDeMaqueta {
  /** Su paso está a la vista: corre la animación. Al dejar de estarlo, vuelve al principio. */
  activa: boolean
}

/** Vuelve al principio recién cuando terminó el fundido de salida: que no se la vea deshacerse. */
const VOLVER: Transition = { duration: 0, delay: DURACION.fundido }

const DIAS_DE_LA_SEMANA = ["L", "M", "M", "J", "V", "S", "D"]
/** Octubre de 2026 empieza un jueves: tres huecos antes del 1. */
const HUECOS_ANTES_DEL_1 = 3
const DIAS_DEL_MES = 31
const HOY = 12
const DIA_ELEGIDO = 15
const HORARIOS = ["09:30", "10:30", "11:00", "12:30", "15:00", "16:30"]
const HORARIO_ELEGIDO = "15:00"

// Primero se marca el día, después la hora, y al final se aprieta el botón.
const MARCA_DEL_DIA: Variants = {
  reposo: { scale: 0, transition: VOLVER },
  activa: { scale: 1, transition: { delay: 0.5, duration: 0.35, ease: CURVA.suave } },
}
const NUMERO_DEL_DIA: Variants = {
  reposo: { opacity: 0, transition: VOLVER },
  activa: { opacity: 1, transition: { delay: 0.6, duration: 0.2, ease: CURVA.suave } },
}
/** El número navy de debajo se apaga cuando aparece el blanco: que no se asome por los bordes. */
const NUMERO_SIN_ELEGIR: Variants = {
  reposo: { opacity: 1, transition: VOLVER },
  activa: { opacity: 0, transition: { delay: 0.6, duration: 0.2, ease: CURVA.suave } },
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
 * un calendario que marca el jueves 15 y después las 15:00, y el botón para
 * confirmar. Los datos son de ejemplo.
 */
export function MaquetaReserva({ activa }: PropsDeMaqueta) {
  return (
    <motion.div
      role="img"
      aria-label="Maqueta: la página de reservas con Color + corte, el jueves 15 y las 15:00 elegidos"
      className={cn(TARJETA_DE_MAQUETA, "w-full max-w-[420px] p-4 text-[13px] leading-[1.35] @sm:p-5")}
      initial="reposo"
      animate={activa ? "activa" : "reposo"}
    >
      <div aria-hidden="true">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2.5">
          <span className="text-lg font-semibold tracking-[-0.02em]">Reservar</span>
          <span className="text-xs text-texto-2">Paso 2 de 3 · Día y hora</span>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2.5 rounded-[14px] border border-borde-suave bg-crema px-3.5 py-[11px] text-sm font-semibold">
          <span>Color + corte</span>
          <span>$37.000</span>
        </div>

        <div className="mt-3.5 flex items-center justify-between text-sm font-semibold">
          <span>Octubre de 2026</span>
          <span className="tracking-[0.2em] text-texto-2">‹ ›</span>
        </div>
        <div className="mt-2 grid grid-cols-7 gap-0.5 text-center">
          {DIAS_DE_LA_SEMANA.map((dia, orden) => (
            <span key={orden} className="text-[11px] text-texto-2">
              {dia}
            </span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-0.5 text-center">
          {Array.from({ length: HUECOS_ANTES_DEL_1 }, (_, orden) => (
            <span key={`hueco-${orden}`} />
          ))}
          {Array.from({ length: DIAS_DEL_MES }, (_, orden) => {
            const dia = orden + 1
            if (dia === DIA_ELEGIDO) {
              return (
                <span key={dia} className="relative grid h-[26px] place-items-center text-xs @sm:h-[30px]">
                  <motion.span
                    variants={MARCA_DEL_DIA}
                    className="absolute left-1/2 top-1/2 size-[26px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ciruela @sm:size-[30px]"
                  />
                  <motion.span variants={NUMERO_SIN_ELEGIR} className="relative">
                    {dia}
                  </motion.span>
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
                  "grid h-[26px] place-items-center text-xs @sm:h-[30px]",
                  dia < HOY && "text-texto-2/70",
                  dia === HOY && "font-semibold underline underline-offset-[3px]"
                )}
              >
                {dia}
              </span>
            )
          })}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {HORARIOS.map((hora) => {
            const elegida = hora === HORARIO_ELEGIDO
            return (
              <span
                key={hora}
                className="relative grid h-[34px] place-items-center overflow-hidden rounded-[12px] border border-borde text-[13px] font-semibold"
              >
                {elegida && <motion.span variants={HORA} className="absolute -inset-px bg-ciruela" />}
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
          className="mt-3.5 grid h-[46px] place-items-center rounded-[14px] bg-ciruela text-sm font-semibold text-white"
        >
          Confirmar reserva
        </motion.div>
      </div>
    </motion.div>
  )
}
