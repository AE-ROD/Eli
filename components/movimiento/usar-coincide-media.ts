"use client"

import { useCallback, useSyncExternalStore } from "react"

/**
 * Si la ventana cumple una media query, y se actualiza cuando deja de cumplirla.
 * La usan los patrones de esta carpeta para decidir el marcado según el ancho
 * o el movimiento reducido.
 *
 * Mientras se hidrata vale `enServidor`, igual que en el HTML del servidor, y
 * recién después pasa al valor real: `useReducedMotion` de framer lee la
 * preferencia ya en el primer render del cliente, y si ese valor decide el
 * marcado, React encuentra un HTML distinto del que esperaba. Para elegir sólo
 * la curva de una animación, `useReducedMotion` alcanza.
 */
export function useCoincideMedia(consulta: string, enServidor = false): boolean {
  const suscribir = useCallback(
    (avisar: () => void) => {
      const lista = window.matchMedia(consulta)
      lista.addEventListener("change", avisar)
      return () => lista.removeEventListener("change", avisar)
    },
    [consulta],
  )

  return useSyncExternalStore(
    suscribir,
    () => window.matchMedia(consulta).matches,
    () => enServidor,
  )
}
