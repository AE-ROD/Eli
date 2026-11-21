"use client"

import { useSyncExternalStore } from "react"

/**
 * El breakpoint `escritorio` del panel (`--breakpoint-escritorio` en
 * `app/globals.css`, 48rem = 768 px), escrito igual que Tailwind para que el
 * cambio caiga en el mismo píxel que las clases `escritorio:` y
 * `max-escritorio:`. Desde ahí el panel es el de computador (barra lateral
 * fija, ventanas centradas), también en la tablet; por debajo, el del celular
 * (cajón, barra inferior, botón flotante y ventanas como hojas).
 */
export const CONSULTA_DE_ESCRITORIO = "(min-width: 48rem)"

/**
 * Desde `lg` (1024 px) cabe la barra lateral entera (240 px). Entre 768 y
 * 1023 (la tablet) va siempre contraída, sólo con los íconos: entera dejaría
 * el contenido en 500 px.
 */
export const CONSULTA_DE_BARRA_ENTERA = "(min-width: 64rem)"

function suscripcionA(consulta: string) {
  return (avisar: () => void) => {
    const lista = window.matchMedia(consulta)
    lista.addEventListener("change", avisar)
    return () => lista.removeEventListener("change", avisar)
  }
}

const suscribirseAlAncho = suscripcionA(CONSULTA_DE_ESCRITORIO)
const suscribirseALaBarraEntera = suscripcionA(CONSULTA_DE_BARRA_ENTERA)

function esAnchoDeEscritorio() {
  return window.matchMedia(CONSULTA_DE_ESCRITORIO).matches
}

function cabeLaBarraEntera() {
  return window.matchMedia(CONSULTA_DE_BARRA_ENTERA).matches
}

/**
 * En el servidor no hay ventana. Responder "celular" no cambia lo que se
 * dibuja: el CSS (`escritorio:` / `max-escritorio:`) ya ubica cada cosa según
 * el ancho antes de que llegue el JS; esto sólo decide comportamiento (cajón,
 * animaciones).
 */
function anchoEnElServidor() {
  return false
}

/** En el servidor se supone que cabe: es lo que se veía antes en todo escritorio. */
function barraEnteraEnElServidor() {
  return true
}

/** Si la ventana mide `escritorio` (768 px) o más. Se actualiza al girar el teléfono o cambiar el ancho. */
export function useEsEscritorio(): boolean {
  return useSyncExternalStore(suscribirseAlAncho, esAnchoDeEscritorio, anchoEnElServidor)
}

/** Si la ventana mide `lg` (1024 px) o más: si la barra lateral cabe entera. */
export function useCabeLaBarraEntera(): boolean {
  return useSyncExternalStore(suscribirseALaBarraEntera, cabeLaBarraEntera, barraEnteraEnElServidor)
}
