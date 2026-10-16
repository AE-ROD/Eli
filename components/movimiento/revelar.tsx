"use client"

import { motion, useReducedMotion } from "framer-motion"
import type { ReactNode } from "react"
import { CURVA, DURACION } from "./tiempos"

const ETIQUETAS = { div: motion.div, li: motion.li, section: motion.section } as const

interface PropsDeRevelar {
  children: ReactNode
  /** Segundos de espera antes de entrar, para escalonar bloques vecinos. */
  retraso?: number
  className?: string
  como?: "div" | "li" | "section"
}

/**
 * Entra una sola vez al aparecer en pantalla: de transparente a visible,
 * subiendo 16px.
 *
 * El punto de partida es el mismo con o sin movimiento reducido, porque es lo
 * que pinta el HTML del servidor; lo que cambia es el viaje. Con movimiento
 * reducido el desplazamiento es instantáneo y queda sólo un fundido corto, sin
 * esperar el `retraso`.
 */
export function Revelar({ children, retraso = 0, className, como = "div" }: PropsDeRevelar) {
  const reducido = useReducedMotion()
  const Etiqueta = ETIQUETAS[como]

  return (
    <Etiqueta
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={
        reducido
          ? { opacity: { duration: 0.2 }, y: { duration: 0 } }
          : { duration: DURACION.fundido, ease: CURVA.fundido, delay: retraso }
      }
    >
      {children}
    </Etiqueta>
  )
}
