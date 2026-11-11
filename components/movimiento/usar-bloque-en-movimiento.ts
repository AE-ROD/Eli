"use client"

import { useRef, useState } from "react"
import { useInView } from "framer-motion"

/**
 * El estado de un bloque de la landing que se mueve solo sin fin (líneas que
 * se ondulan, maquetas que flotan, un punto que recorre una línea): si la
 * persona lo pausó y si está en pantalla.
 *
 * `ref` va en el bloque; `quieto` dice cuándo congelarlo (en pausa o fuera de
 * la pantalla): con `animaciones-en-pausa` en el bloque para lo de CSS y con
 * `enPausa` para `TrazosOndulantes`. `pausado` y `setPausado` son los de su
 * `BotonDePausa`.
 */
export function useBloqueEnMovimiento<T extends Element = HTMLDivElement>() {
  const ref = useRef<T>(null)
  const enPantalla = useInView(ref, { margin: "100px 0px" })
  const [pausado, setPausado] = useState(false)
  return { ref, enPantalla, pausado, setPausado, quieto: pausado || !enPantalla }
}
