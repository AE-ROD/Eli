"use client"

import { useSyncExternalStore } from "react"

/**
 * Lo que se ve de la página cuando el teclado del celular está abierto.
 *
 * En el iPhone, y en Chrome para Android desde la versión 108, abrir el
 * teclado no achica la ventana: el teclado se pone encima y lo `fixed` con
 * `bottom: 0` queda detrás. Así, el pie de una hoja (`MarcoDeModal`, con
 * "Guardar") quedaba tapado mientras se escribía. `visualViewport` sí dice
 * cuánto se ve; con eso la hoja se apoya encima del teclado.
 *
 * Con zoom (pellizcando) no se toca nada: ahí lo que se ve es un recorte que
 * la persona eligió, no el teclado, y la hoja sigue en su lugar.
 */

export interface MedidasVisibles {
  /** `visualViewport.height`. */
  alto: number
  /** `visualViewport.offsetTop`: cuánto se corrió lo que se ve hacia abajo. */
  desplazamiento: number
  /** `visualViewport.scale`: 1 sin zoom. */
  escala: number
}

export interface AreaVisible {
  top: number
  height: number
}

/**
 * Dónde poner la capa de una hoja para que quede en lo que se ve: `null` si
 * se ve la ventana entera (sin teclado) o si hay zoom; si no, el arriba y el
 * alto de lo que se ve, en píxeles de la página.
 */
export function areaVisible(altoDeLaVentana: number, visible: MedidasVisibles | null): AreaVisible | null {
  if (!visible || Math.abs(visible.escala - 1) > 0.01) return null
  const top = Math.max(0, Math.round(visible.desplazamiento))
  const height = Math.round(visible.alto)
  // Un píxel de diferencia es redondeo, no un teclado.
  if (top < 1 && altoDeLaVentana - height < 1) return null
  if (height <= 0) return null
  return { top, height }
}

function suscribirse(avisar: () => void) {
  const visible = window.visualViewport
  if (!visible) return () => {}
  visible.addEventListener("resize", avisar)
  visible.addEventListener("scroll", avisar)
  return () => {
    visible.removeEventListener("resize", avisar)
    visible.removeEventListener("scroll", avisar)
  }
}

/**
 * Una sola cadena por medida: `useSyncExternalStore` compara con `Object.is`
 * y un objeto nuevo en cada lectura lo haría dibujar sin fin.
 */
function leer(): string {
  const visible = window.visualViewport
  const area = areaVisible(
    window.innerHeight,
    visible ? { alto: visible.height, desplazamiento: visible.offsetTop, escala: visible.scale } : null
  )
  return area ? `${area.top}:${area.height}` : ""
}

function enElServidor(): string {
  return ""
}

/** El área que se ve mientras el teclado está abierto (`areaVisible`); `null` sin teclado. */
export function useAreaVisible(): AreaVisible | null {
  const valor = useSyncExternalStore(suscribirse, leer, enElServidor)
  if (!valor) return null
  const [top, height] = valor.split(":").map(Number)
  return { top, height }
}
