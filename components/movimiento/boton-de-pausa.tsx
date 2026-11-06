"use client"

import { Pause, Play } from "lucide-react"
import { BotonIcono } from "@/components/comunes/boton-icono"

interface PropsDeBotonDePausa {
  pausado: boolean
  alCambiar: (pausado: boolean) => void
  /**
   * El nombre del botón, que no cambia: lo que cambia es `aria-pressed`
   * (apretado = en pausa). Por defecto, "Pausar la animación".
   */
  etiqueta?: string
  className?: string
}

/**
 * El botón que detiene lo que se mueve solo en un bloque de la landing (WCAG
 * 2.2.2: lo que se mueve solo más de cinco segundos se tiene que poder
 * detener). Es un botón de dos estados: muestra la pausa mientras se mueve y
 * el "seguir" mientras está quieto.
 *
 * Quien lo usa guarda el estado y, en pausa, pone `animaciones-en-pausa` en
 * el bloque (congela las animaciones de CSS) y detiene lo que mueva con
 * JavaScript. Se ve siempre, también con movimiento reducido: ahí el bloque
 * arranca en pausa y la persona puede elegir verlo moverse.
 */
export function BotonDePausa({ pausado, alCambiar, etiqueta = "Pausar la animación", className }: PropsDeBotonDePausa) {
  return (
    <BotonIcono
      tamano="sm"
      etiqueta={etiqueta}
      aria-pressed={pausado}
      icono={pausado ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
      onClick={() => alCambiar(!pausado)}
      className={className}
    />
  )
}
