"use client"

import { useSyncExternalStore } from "react"

/**
 * El `lg` de Tailwind, escrito igual que Tailwind (64rem) para que el cambio
 * caiga en el mismo píxel que las clases `lg:` y `max-lg:`. Desde ahí el panel
 * es el de computador (barra lateral fija, ventanas centradas); por debajo, el
 * del celular (cajón, barra inferior, botón flotante y ventanas como hojas).
 */
export const CONSULTA_DE_ESCRITORIO = "(min-width: 64rem)"

function suscribirseAlAncho(avisar: () => void) {
  const consulta = window.matchMedia(CONSULTA_DE_ESCRITORIO)
  consulta.addEventListener("change", avisar)
  return () => consulta.removeEventListener("change", avisar)
}

function esAnchoDeEscritorio() {
  return window.matchMedia(CONSULTA_DE_ESCRITORIO).matches
}

/**
 * En el servidor no hay ventana. Responder "celular" no cambia lo que se
 * dibuja: el CSS (`lg:` / `max-lg:`) ya ubica cada cosa según el ancho antes
 * de que llegue el JS; esto sólo decide comportamiento (cajón, animaciones).
 */
function anchoEnElServidor() {
  return false
}

/** Si la ventana mide `lg` o más. Se actualiza al girar el teléfono o cambiar el ancho. */
export function useEsEscritorio(): boolean {
  return useSyncExternalStore(suscribirseAlAncho, esAnchoDeEscritorio, anchoEnElServidor)
}
