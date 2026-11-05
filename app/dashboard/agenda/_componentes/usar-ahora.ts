"use client"

import { useEffect, useState } from "react"

/** Cada cuánto se vuelve a mirar el reloj con el detalle abierto. */
const CADA_MS = 30_000

/**
 * "Ahora" para decidir qué se ofrece sobre una cita (si ya empezó, si se
 * puede marcar "No vino"). Se vuelve a tomar al pasar a otra cita (`clave`)
 * y cada medio minuto mientras se mira la misma: tomado una sola vez al
 * montarse, el detalle que quedaba abierto mientras se pasaba de una cita a
 * otra decidía con la hora de cuando se abrió (#100), y "No vino" aparecía
 * con atraso o "Reactivar" seguía ofrecido para una cita que ya empezó.
 * El servidor vuelve a mirar la hora de todos modos.
 */
export function useAhora(clave: string): number {
  const [ahora, setAhora] = useState(() => Date.now())

  useEffect(() => {
    const tomar = () => setAhora(Date.now())
    // Al cambiar de cita, enseguida (fuera del render, que tiene que ser puro); después, cada medio minuto.
    const alCambiar = setTimeout(tomar, 0)
    const reloj = setInterval(tomar, CADA_MS)
    return () => {
      clearTimeout(alCambiar)
      clearInterval(reloj)
    }
  }, [clave])

  return ahora
}
