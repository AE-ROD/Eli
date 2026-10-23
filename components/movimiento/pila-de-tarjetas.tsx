"use client"

import { motion, useScroll, useTransform, type MotionValue } from "framer-motion"
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { useCoincideMedia } from "./usar-coincide-media"

export interface TarjetaDeLaPila {
  /** Estable: es la clave de la tarjeta. */
  id: string
  /**
   * La tarjeta entera, con su fondo, su relleno y `rounded-tarjeta`: el velo
   * que la oscurece cuando la tapa la siguiente lleva ese mismo radio.
   */
  contenido: ReactNode
}

interface PropsDePilaDeTarjetas {
  tarjetas: readonly TarjetaDeLaPila[]
  className?: string
}

/**
 * Sin movimiento reducido y con alto suficiente, las tarjetas quedan fijas.
 * Con `useCoincideMedia` y no con `useReducedMotion`: la consulta decide el
 * marcado (`sticky` o no), y mientras hidrata tiene que valer lo mismo que el
 * HTML del servidor.
 */
const CONSULTA_REDUCIDO = "(prefers-reduced-motion: reduce)"
const CONSULTA_VENTANA_BAJA = "(max-height: 639.98px)"

/** Lo que se achica la primera tarjeta cuando la tapa la siguiente; la última no se achica. */
const ESCALA_MINIMA = 0.9

/** Lo que sube la tarjeta tapada, en píxeles, para que asome apenas su borde de arriba. */
const SUBIDA = -8

/** La opacidad del velo navy sobre la tarjeta ya tapada. */
const VELO = 0.05

/**
 * Tarjetas apiladas que se tapan unas a otras al bajar (stacking cards).
 *
 * Cada tarjeta queda `sticky` un poco más abajo que la anterior (24px más el
 * encabezado si está flotante, y 20px por tarjeta en el teléfono, 24px desde
 * md), así de cada una asoma el borde de arriba. Mientras la siguiente sube y
 * la tapa, la de abajo se achica levemente, sube 8px y se vela con navy. Sólo
 * se animan `transform` y `opacity`, atados al avance del scroll por la pila.
 *
 * Una tarjeta más alta que la ventana queda fija recién cuando se ve su final
 * (su `top` se vuelve negativo): si no, la siguiente le taparía lo de abajo
 * sin que nadie lo alcance a leer.
 *
 * Con movimiento reducido y en ventanas de menos de 640px de alto no hay nada
 * fijo ni atado al scroll: son tarjetas apiladas comunes, una debajo de otra.
 */
export function PilaDeTarjetas({ tarjetas, className }: PropsDePilaDeTarjetas) {
  const pila = useRef<HTMLDivElement>(null)
  const reducido = useCoincideMedia(CONSULTA_REDUCIDO)
  const ventanaBaja = useCoincideMedia(CONSULTA_VENTANA_BAJA)
  const conScroll = !reducido && !ventanaBaja

  // De 0, con el principio de la pila arriba de la pantalla, a 1, con su final abajo.
  const { scrollYProgress: avance } = useScroll({ target: pila, offset: ["start start", "end end"] })
  const total = tarjetas.length

  return (
    <div
      ref={pila}
      className={cn(
        "relative flex flex-col gap-6 md:gap-10",
        // El paso entre tarjetas fijas. El relleno de abajo deja tapar la última por completo.
        conScroll && "pb-40 [--paso-de-pila:20px] md:[--paso-de-pila:24px]",
        className
      )}
    >
      {tarjetas.map((tarjeta, indice) => (
        <TarjetaApilada
          key={tarjeta.id}
          indice={indice}
          total={total}
          avance={avance}
          conScroll={conScroll}
        >
          {tarjeta.contenido}
        </TarjetaApilada>
      ))}
    </div>
  )
}

interface PropsDeTarjetaApilada {
  indice: number
  total: number
  avance: MotionValue<number>
  conScroll: boolean
  children: ReactNode
}

function TarjetaApilada({ indice, total, avance, conScroll, children }: PropsDeTarjetaApilada) {
  const caja = useRef<HTMLDivElement>(null)
  const esLaUltima = indice === total - 1

  // El tramo del avance en que la siguiente tarjeta pasa encima de ésta: la
  // pila se reparte en partes iguales, una por tarjeta.
  const desde = indice / total
  const hasta = (indice + 1) / total
  const anima = conScroll && !esLaUltima
  const escalaFinal = ESCALA_MINIMA + ((1 - ESCALA_MINIMA) * indice) / Math.max(1, total - 1)
  const escala = useTransform(avance, [desde, hasta], anima ? [1, escalaFinal] : [1, 1])
  const subida = useTransform(avance, [desde, hasta], anima ? [0, SUBIDA] : [0, 0])
  const velo = useTransform(avance, [desde, hasta], anima ? [0, VELO] : [0, 0])

  // Su alto, en una variable de CSS, para no quedar fija con lo de abajo fuera
  // de la pantalla. Se mide sólo cuando la pila toma el scroll.
  useEffect(() => {
    const nodo = caja.current
    if (!conScroll || !nodo) return
    const publicar = () => nodo.style.setProperty("--alto-de-tarjeta", `${nodo.offsetHeight}px`)
    publicar()
    const observador = new ResizeObserver(publicar)
    observador.observe(nodo)
    return () => observador.disconnect()
  }, [conScroll])

  return (
    <div
      ref={caja}
      style={{ "--indice-de-pila": indice } as CSSProperties}
      className={cn(
        conScroll &&
          // Debajo del encabezado si está flotante y un paso más abajo que la
          // anterior; o más arriba, si la tarjeta no entra en la ventana. Sigue
          // al encabezado con su misma duración y curva.
          "sticky top-[min(calc(var(--encabezado-ocupa,24px)_+_var(--paso-de-pila)_*_var(--indice-de-pila)),calc(100svh_-_var(--alto-de-tarjeta,0px)_-_16px))] transition-[top] duration-200 ease-suave"
      )}
    >
      <motion.div className="relative origin-top" style={{ scale: escala, y: subida }}>
        {children}
        {anima && (
          <motion.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-tarjeta bg-navy squircle"
            style={{ opacity: velo }}
          />
        )}
      </motion.div>
    </div>
  )
}
