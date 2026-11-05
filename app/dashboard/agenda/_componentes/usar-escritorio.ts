"use client"

import { useSyncExternalStore } from "react"

/** Desde `lg` (1024 px) el detalle de la cita va al lado del calendario; más angosto, encima. */
const CONSULTA_DE_ESCRITORIO = "(min-width: 64rem)"

function suscribirAlAncho(avisar: () => void) {
  const consulta = window.matchMedia(CONSULTA_DE_ESCRITORIO)
  consulta.addEventListener("change", avisar)
  return () => consulta.removeEventListener("change", avisar)
}

/**
 * Si la pantalla es de escritorio (`lg` o más). En el celular el detalle de
 * la cita no cabe al lado del calendario y se abre como diálogo (#136).
 */
export function useEsEscritorio(): boolean {
  return useSyncExternalStore(
    suscribirAlAncho,
    () => window.matchMedia(CONSULTA_DE_ESCRITORIO).matches,
    // En el servidor el detalle nunca está abierto: da igual cuál se elija.
    () => true
  )
}
