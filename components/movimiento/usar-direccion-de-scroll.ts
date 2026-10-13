"use client"

import { useEffect, useState } from "react"
import { LECTURA_INICIAL, leerScroll, type EstadoDelEncabezado } from "@/lib/direccion-de-scroll"

/**
 * El estado del encabezado según el scroll de la ventana: `arriba`, `oculto`
 * (bajando) o `flotante` (subiendo). La regla está en `lib/direccion-de-scroll.ts`.
 *
 * Lee la posición una vez por cuadro con `requestAnimationFrame`, no en cada
 * evento: un scroll con rueda dispara varios por cuadro y cada `setState` de
 * más es un render de más. El oyente es pasivo para que el navegador no espere
 * a JavaScript antes de mover la página.
 *
 * En el servidor y en el primer render vale `arriba`, que es lo que pinta el
 * HTML; la posición real se lee después de montar, así la hidratación no choca
 * con una página que el navegador restauró a mitad de camino.
 */
export function useDireccionDeScroll(): EstadoDelEncabezado {
  const [estado, setEstado] = useState<EstadoDelEncabezado>(LECTURA_INICIAL.estado)

  useEffect(() => {
    let lectura = LECTURA_INICIAL
    let cuadro = 0

    const leer = () => {
      cuadro = 0
      const siguiente = leerScroll(lectura, window.scrollY)
      if (siguiente === lectura) return
      lectura = siguiente
      // React descarta el render si el estado no cambió (bajar estando oculto).
      setEstado(siguiente.estado)
    }

    const alMoverse = () => {
      if (cuadro === 0) cuadro = window.requestAnimationFrame(leer)
    }

    // La primera lectura también va en un cuadro: la página puede haber
    // cargado ya bajada (un enlace con #, o el navegador restaurando el scroll).
    cuadro = window.requestAnimationFrame(leer)
    window.addEventListener("scroll", alMoverse, { passive: true })

    return () => {
      window.removeEventListener("scroll", alMoverse)
      if (cuadro !== 0) window.cancelAnimationFrame(cuadro)
    }
  }, [])

  return estado
}
