/**
 * Mientras haya un diálogo del panel abierto, la página de atrás no se
 * desplaza: con la rueda o el dedo sobre el velo se movía lo de atrás, y al
 * cerrar el diálogo la persona quedaba en otra parte de la página.
 *
 * Cuenta los diálogos abiertos (uno encima de otro, o uno que reemplaza a
 * otro mientras el primero se desvanece): el primero en abrirse bloquea y el
 * último en cerrarse devuelve lo que había. Al esconder la barra de
 * desplazamiento se agrega su ancho como margen derecho, para que la página
 * no salte de lado.
 *
 * Es pura en lo que toca (`estilo` y el ancho de la barra), para probarla sin
 * navegador; `MarcoDeModal` le pasa el `<html>`.
 */

export interface EstiloBloqueable {
  overflow: string
  paddingRight: string
}

export interface BloqueoDeScroll {
  /** Bloquea (si es el primero) y devuelve cómo soltar este bloqueo; soltar dos veces no cuenta doble. */
  bloquear: () => () => void
}

export function crearBloqueoDeScroll(estilo: () => EstiloBloqueable, anchoDeLaBarra: () => number): BloqueoDeScroll {
  let abiertos = 0
  let antes: EstiloBloqueable | null = null
  return {
    bloquear() {
      if (abiertos === 0) {
        const actual = estilo()
        antes = { overflow: actual.overflow, paddingRight: actual.paddingRight }
        const ancho = anchoDeLaBarra()
        actual.overflow = "hidden"
        if (ancho > 0) actual.paddingRight = `${ancho}px`
      }
      abiertos++
      let suelto = false
      return () => {
        if (suelto) return
        suelto = true
        abiertos--
        if (abiertos === 0 && antes) {
          const actual = estilo()
          actual.overflow = antes.overflow
          actual.paddingRight = antes.paddingRight
          antes = null
        }
      }
    },
  }
}
