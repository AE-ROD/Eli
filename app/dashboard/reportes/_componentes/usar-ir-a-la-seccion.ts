"use client"

import { useEffect, useRef } from "react"

/**
 * Cambiar de página en un historial y volver al principio de su tabla: los
 * botones están abajo y la página nueva empieza arriba.
 *
 * El desplazamiento espera a que la página nueva esté dibujada. Antes salía al
 * apretar "Siguiente", con la página vieja todavía en pantalla: cuando llegaba
 * la nueva, la tabla cambiaba de alto en medio del desplazamiento y la vista
 * no terminaba en la sección. Se espera a que lleguen los datos y termine la
 * actualización, y recién en el cuadro siguiente se lleva la sección a la
 * vista. El foco se queda en el botón que se apretó.
 *
 * El desplazamiento es suave o inmediato según `scroll-behavior` (el `<html>`
 * lo tiene suave, salvo con movimiento reducido).
 *
 * @param datos Lo que trae cada página (el reporte): cuando cambia, llegó la página nueva.
 */
export function useIrALaSeccion<T extends HTMLElement = HTMLElement>(
  onPagina: (pagina: number) => void,
  actualizando: boolean,
  datos: unknown
) {
  const seccion = useRef<T>(null)
  /** Se pidió otra página y todavía no se llevó la sección a la vista. */
  const pidioOtraPagina = useRef(false)

  useEffect(() => {
    if (!pidioOtraPagina.current || actualizando) return
    pidioOtraPagina.current = false
    requestAnimationFrame(() => seccion.current?.scrollIntoView({ block: "start" }))
  }, [actualizando, datos])

  const irA = (pagina: number) => {
    pidioOtraPagina.current = true
    onPagina(pagina)
  }

  return { seccion, irA }
}
