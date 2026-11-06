import {
  cuadranteDe,
  cuadrantesDe,
  esDelMaxilar,
  piezasDelCuadrante,
  posicionDe,
  type Cara,
  type Denticion,
} from "@/lib/odontograma"

/**
 * Dónde se dibuja cada pieza del odontograma en arcada: las dos arcadas en
 * U, vistas de frente como en la ficha de papel. La derecha del paciente
 * queda a la izquierda de quien mira (cuadrantes 1 y 4, o 5 y 8 en la
 * temporal).
 *
 * Todo en unidades del dibujo (620 × 700): la pantalla las multiplica por la
 * escala que le toque. Funciones puras, sin DOM: se prueban solas.
 *
 * Cada pieza es un cuadrado girado para que su borde de arriba mire hacia
 * afuera de la arcada (vestibular), el de abajo hacia adentro (palatino o
 * lingual), el centro sea la cara oclusal o incisal y los lados, mesial
 * (hacia la línea media) y distal. Qué cara es cada lado lo dice
 * `lib/odontograma.ts` (`carasDe`), no este archivo: acá sólo se ubica.
 */

export const ANCHO_DE_LA_ARCADA = 620
export const ALTO_DE_LA_ARCADA = 700

/** La línea media, entre los incisivos centrales. */
export const LINEA_MEDIA = 310
/** El borde de los incisivos de arriba y el de los de abajo. */
const ARRIBA = 64
const ABAJO = 654
/** El centro de cada arcada, para saber qué es "afuera". */
const PROFUNDIDAD_DE_LA_ARCADA = 170
/** La línea que separa las dos arcadas ("← Derecha del paciente · Izquierda del paciente →"). */
export const LINEA_ENTRE_ARCADAS = 359

/**
 * Por posición (1 a 8, desde la línea media): cuánto se aparta de la línea
 * media, cuánto baja desde el borde de los incisivos y el lado del cuadrado.
 * Los molares son más grandes que los incisivos.
 */
const PERMANENTE: readonly (readonly [number, number, number])[] = [
  [29, 0, 30],
  [74, 12, 28],
  [116, 34, 27],
  [147, 64, 28],
  [175, 99, 30],
  [208, 144, 38],
  [223, 195, 37],
  [237, 247, 34],
]

/** La temporal es más chica y más cerrada: cinco piezas por cuadrante. */
const TEMPORAL: readonly (readonly [number, number, number])[] = [
  [27, 0, 27],
  [69, 12, 25],
  [108, 34, 25],
  [152, 80, 32],
  [184, 132, 34],
]

/** Los cinco lugares del cuadrado de una pieza, ya girado. */
export type LugarDeCara = "afuera" | "adentro" | "izquierda" | "derecha" | "centro"

export interface Punto {
  x: number
  y: number
}

export interface GeometriaDePieza {
  pieza: number
  /** El centro del cuadrado. */
  centro: Punto
  /** El lado del cuadrado. */
  lado: number
  /** Cuánto se gira el cuadrado, en grados (como `rotate()` de CSS). */
  rotacion: number
  /** Hacia afuera de la arcada, de largo 1. */
  normal: Punto
  /** Qué cara va en cada lugar del cuadrado girado. */
  caras: Record<LugarDeCara, Cara>
}

/** Si la pieza es del lado derecho del paciente: el que se dibuja a la izquierda. */
export function esDelLadoDerecho(pieza: number): boolean {
  return [1, 4, 5, 8].includes(cuadranteDe(pieza))
}

function tablaDe(pieza: number) {
  return cuadranteDe(pieza) >= 5 ? TEMPORAL : PERMANENTE
}

/** El centro de una pieza, sin girar. */
function puntoDe(pieza: number): Punto & { lado: number } {
  const [aparte, baja, lado] = tablaDe(pieza)[posicionDe(pieza) - 1]
  return {
    x: LINEA_MEDIA + (esDelLadoDerecho(pieza) ? -aparte : aparte),
    y: esDelMaxilar(pieza) ? ARRIBA + baja : ABAJO - baja,
    lado,
  }
}

/**
 * La geometría de una pieza válida. El giro sale de la dirección de la
 * arcada en esa pieza (de la vecina de adelante a la de atrás); el central
 * mira a su espejo del otro lado de la línea media, y el último sigue la
 * dirección de su vecino.
 */
export function geometriaDePieza(pieza: number): GeometriaDePieza {
  const posicion = posicionDe(pieza)
  const ultima = tablaDe(pieza).length
  const punto = puntoDe(pieza)
  const anterior = posicion === 1 ? { x: 2 * LINEA_MEDIA - punto.x, y: punto.y } : puntoDe(pieza - 1)
  const siguiente =
    posicion === ultima ? { x: 2 * punto.x - anterior.x, y: 2 * punto.y - anterior.y } : puntoDe(pieza + 1)
  const tangente = { x: siguiente.x - anterior.x, y: siguiente.y - anterior.y }

  const maxilar = esDelMaxilar(pieza)
  const centroDeLaArcada = { x: LINEA_MEDIA, y: maxilar ? ARRIBA + PROFUNDIDAD_DE_LA_ARCADA : ABAJO - PROFUNDIDAD_DE_LA_ARCADA }
  let normal = { x: -tangente.y, y: tangente.x }
  if (normal.x * (punto.x - centroDeLaArcada.x) + normal.y * (punto.y - centroDeLaArcada.y) < 0) {
    normal = { x: -normal.x, y: -normal.y }
  }
  const largo = Math.hypot(normal.x, normal.y)
  normal = { x: normal.x / largo, y: normal.y / largo }

  // Girar `θ` lleva el "arriba" del cuadrado (0, -1) a (sen θ, -cos θ): la normal.
  const angulo = Math.atan2(normal.x, -normal.y)
  // El lado derecho del cuadrado girado es (cos θ, sen θ). Si apunta hacia la
  // vecina de adelante (la que está más cerca de la línea media), es mesial.
  const derechaEsMesial = Math.cos(angulo) * -tangente.x + Math.sin(angulo) * -tangente.y > 0

  return {
    pieza,
    centro: { x: punto.x, y: punto.y },
    lado: punto.lado,
    rotacion: (angulo * 180) / Math.PI,
    normal,
    caras: {
      afuera: "V",
      adentro: maxilar ? "P" : "L",
      derecha: derechaEsMesial ? "M" : "D",
      izquierda: derechaEsMesial ? "D" : "M",
      centro: posicion <= 3 ? "I" : "O",
    },
  }
}

/** Todas las piezas de una dentición con su geometría, cuadrante por cuadrante. */
export function geometriaDeLaArcada(denticion: Denticion): GeometriaDePieza[] {
  return cuadrantesDe(denticion).flatMap(piezasDelCuadrante).map(geometriaDePieza)
}

/**
 * Las dos filas de la arcada como se ven de izquierda a derecha: arriba
 * 18…11 21…28, abajo 48…41 31…38 (o las temporales). Es el orden en que se
 * recorren con las flechas.
 */
export function filasDeLaArcada(denticion: Denticion): [number[], number[]] {
  const [derechaArriba, izquierdaArriba, izquierdaAbajo, derechaAbajo] = cuadrantesDe(denticion).map(piezasDelCuadrante)
  return [
    [...derechaArriba].reverse().concat(izquierdaArriba),
    [...derechaAbajo].reverse().concat(izquierdaAbajo),
  ]
}

export type TeclaDeLaArcada = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End"

export const TECLAS_DE_LA_ARCADA: readonly string[] = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]

/**
 * A qué pieza se pasa con una tecla, desde `pieza`: a los lados por la misma
 * fila (sin dar la vuelta), arriba y abajo a la de la otra arcada en la misma
 * columna, Inicio y Fin a la punta de la fila. Una pieza que no está en la
 * dentición se queda donde está.
 */
export function piezaVecina(denticion: Denticion, pieza: number, tecla: TeclaDeLaArcada): number {
  const filas = filasDeLaArcada(denticion)
  const fila = filas.findIndex((candidata) => candidata.includes(pieza))
  if (fila === -1) return pieza
  const columna = filas[fila].indexOf(pieza)
  const ultima = filas[fila].length - 1
  switch (tecla) {
    case "ArrowLeft":
      return filas[fila][Math.max(columna - 1, 0)]
    case "ArrowRight":
      return filas[fila][Math.min(columna + 1, ultima)]
    case "ArrowUp":
      return filas[0][columna]
    case "ArrowDown":
      return filas[1][columna]
    case "Home":
      return filas[fila][0]
    case "End":
      return filas[fila][ultima]
  }
}

/**
 * Las caras de la pieza en la cruz del panel "Pieza seleccionada": vestibular
 * arriba, palatina o lingual abajo, oclusal o incisal al centro, y mesial del
 * lado de la línea media como se ve en el dibujo (a la derecha en las piezas
 * que se dibujan a la izquierda).
 */
export function carasEnLaCruz(pieza: number): Record<LugarDeCara, Cara> {
  const derecha = esDelLadoDerecho(pieza)
  return {
    afuera: "V",
    adentro: esDelMaxilar(pieza) ? "P" : "L",
    izquierda: derecha ? "D" : "M",
    derecha: derecha ? "M" : "D",
    centro: posicionDe(pieza) <= 3 ? "I" : "O",
  }
}
