"use client"

import { useEffect, useRef } from "react"
import { useAnimate, useReducedMotion, type AnimationPlaybackControls } from "framer-motion"
import { CURVA } from "./tiempos"

export interface TrazoOndulante {
  /**
   * Las formas por las que pasa la línea, como el `d` de un `<path>`. La
   * primera es la de reposo (la que pinta el servidor y la que queda con
   * movimiento reducido) y la última se repite igual a la primera, así el
   * ciclo cierra sin salto. Todas con los mismos comandos y la misma cantidad
   * de números: se interpolan número a número.
   */
  formas: readonly string[]
  /** Segundos de un ciclo. */
  duracion: number
  /** Segundos que el ciclo arranca adelantado, para que las líneas no vayan juntas. */
  desfase?: number
  /** La clase del color del trazo, escrita entera (`stroke-frambuesa`). */
  color: string
  /** Por defecto, 1. */
  opacidad?: number
  /** Por defecto, 3. */
  grosor?: number
}

interface PropsDeTrazosOndulantes {
  trazos: readonly TrazoOndulante[]
  /** Quietas donde estén: en pausa o fuera de la pantalla. */
  enPausa: boolean
}

/**
 * Líneas que se ondulan sin fin, pasando de una forma a otra. Van dentro de
 * un `<svg>` de quien las usa (son un `<g>`), que pone el `viewBox` y el resto
 * del dibujo.
 *
 * Las anima framer-motion y no `<animate>` de SVG: las animaciones SMIL no
 * respetan "reducir movimiento" ni se pueden pausar desde la página. Con
 * movimiento reducido no arrancan y quedan en la primera forma. En pausa se
 * congelan donde están y siguen de ahí.
 */
export function TrazosOndulantes({ trazos, enPausa }: PropsDeTrazosOndulantes) {
  const [alcance, animar] = useAnimate<SVGGElement>()
  const reducido = useReducedMotion()
  const animaciones = useRef<AnimationPlaybackControls[]>([])
  // La pausa se lee también al arrancar: si ya estaba en pausa, arrancan quietas.
  const pausa = useRef(enPausa)

  useEffect(() => {
    const grupo = alcance.current
    if (reducido || !grupo) return
    const caminos = Array.from(grupo.querySelectorAll("path"))
    const lista = trazos.map((trazo, indice) => {
      const control = animar(
        caminos[indice],
        { d: [...trazo.formas] },
        {
          duration: trazo.duracion,
          ease: CURVA.onda,
          // Repartidas parejo en el ciclo.
          times: trazo.formas.map((_, paso) => paso / (trazo.formas.length - 1)),
          repeat: Infinity,
        }
      )
      control.time = trazo.desfase ?? 0
      if (pausa.current) control.pause()
      return control
    })
    animaciones.current = lista
    return () => {
      for (const control of lista) control.stop()
      animaciones.current = []
      // React no vuelve a escribir un `d` que no cambió: se deja cada línea en
      // su forma de reposo, por si lo que sigue es el movimiento reducido.
      caminos.forEach((camino, indice) => {
        const reposo = trazos[indice]?.formas[0]
        if (reposo) camino.setAttribute("d", reposo)
      })
    }
  }, [reducido, trazos, animar, alcance])

  useEffect(() => {
    pausa.current = enPausa
    for (const control of animaciones.current) {
      if (enPausa) control.pause()
      else control.play()
    }
  }, [enPausa])

  return (
    <g ref={alcance} fill="none" strokeLinecap="round" strokeLinejoin="round">
      {trazos.map((trazo, indice) => (
        <path
          key={indice}
          d={trazo.formas[0]}
          className={trazo.color}
          strokeOpacity={trazo.opacidad ?? 1}
          strokeWidth={trazo.grosor ?? 3}
        />
      ))}
    </g>
  )
}
