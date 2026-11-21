"use client"

import { useSyncExternalStore } from "react"

/**
 * Desde `lg` (1024 px) el detalle de la cita va al lado del calendario; más
 * angosto, encima. No es el corte celular/computador del panel (768 px, ver
 * `components/panel/ancho-de-escritorio.ts`): en la tablet el calendario ya se
 * ve como en el computador, pero el detalle no cabe al lado y se abre como
 * ventana (centrada desde 768, hoja en el celular).
 */
const CONSULTA_DE_ESCRITORIO = "(min-width: 64rem)"

function suscribirAlAncho(avisar: () => void) {
  const consulta = window.matchMedia(CONSULTA_DE_ESCRITORIO)
  consulta.addEventListener("change", avisar)
  return () => consulta.removeEventListener("change", avisar)
}

/**
 * Si el detalle cabe al lado del calendario (`lg` o más). Por debajo no cabe
 * y se abre como diálogo (#136).
 */
export function useEsEscritorio(): boolean {
  return useSyncExternalStore(
    suscribirAlAncho,
    () => window.matchMedia(CONSULTA_DE_ESCRITORIO).matches,
    // En el servidor el detalle nunca está abierto: da igual cuál se elija.
    () => true
  )
}
