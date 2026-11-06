import { describe, expect, it } from "vitest"
import { carasDe, piezasDe } from "@/lib/odontograma"
import {
  ANCHO_DE_LA_ARCADA,
  ALTO_DE_LA_ARCADA,
  LINEA_MEDIA,
  carasEnLaCruz,
  filasDeLaArcada,
  geometriaDeLaArcada,
  geometriaDePieza,
  piezaVecina,
} from "./geometria"

describe("geometriaDeLaArcada", () => {
  it("dibuja las 32 permanentes y las 20 temporales, cada una una vez", () => {
    expect(geometriaDeLaArcada("permanente").map((g) => g.pieza)).toEqual(piezasDe("permanente"))
    expect(geometriaDeLaArcada("temporal").map((g) => g.pieza)).toEqual(piezasDe("temporal"))
  })

  it("todas caben en el dibujo", () => {
    for (const g of [...geometriaDeLaArcada("permanente"), ...geometriaDeLaArcada("temporal")]) {
      expect(g.centro.x - g.lado / 2).toBeGreaterThanOrEqual(0)
      expect(g.centro.x + g.lado / 2).toBeLessThanOrEqual(ANCHO_DE_LA_ARCADA)
      expect(g.centro.y - g.lado / 2).toBeGreaterThanOrEqual(0)
      expect(g.centro.y + g.lado / 2).toBeLessThanOrEqual(ALTO_DE_LA_ARCADA)
    }
  })

  it("la derecha del paciente se dibuja a la izquierda, y cada pieza es el espejo de su par", () => {
    const g16 = geometriaDePieza(16)
    const g26 = geometriaDePieza(26)
    expect(g16.centro.x).toBeLessThan(LINEA_MEDIA)
    expect(g26.centro.x).toBeGreaterThan(LINEA_MEDIA)
    expect(g16.centro.x + g26.centro.x).toBeCloseTo(2 * LINEA_MEDIA)
    expect(g16.centro.y).toBeCloseTo(g26.centro.y)
    expect(g16.rotacion).toBeCloseTo(-g26.rotacion)
  })

  it("el maxilar va arriba y la mandíbula abajo", () => {
    expect(geometriaDePieza(11).centro.y).toBeLessThan(geometriaDePieza(41).centro.y)
    expect(geometriaDePieza(55).centro.y).toBeLessThan(geometriaDePieza(85).centro.y)
  })

  it("la normal apunta hacia afuera de la arcada: los incisivos de arriba, hacia arriba; los de abajo, hacia abajo", () => {
    expect(geometriaDePieza(11).normal.y).toBeLessThan(-0.9)
    expect(geometriaDePieza(41).normal.y).toBeGreaterThan(0.9)
    // Un molar de la derecha del paciente mira hacia la izquierda del dibujo.
    expect(geometriaDePieza(17).normal.x).toBeLessThan(-0.5)
    expect(geometriaDePieza(27).normal.x).toBeGreaterThan(0.5)
  })

  it("los cinco lugares del cuadrado son las cinco caras de la pieza", () => {
    for (const g of [...geometriaDeLaArcada("permanente"), ...geometriaDeLaArcada("temporal")]) {
      expect(Object.values(g.caras).sort()).toEqual([...carasDe(g.pieza)].sort())
      expect(g.caras.afuera).toBe("V")
    }
  })

  it("el lado mesial mira a la línea media", () => {
    for (const g of [...geometriaDeLaArcada("permanente"), ...geometriaDeLaArcada("temporal")]) {
      const angulo = (g.rotacion * Math.PI) / 180
      // El lado derecho del cuadrado girado.
      const derecha = { x: Math.cos(angulo), y: Math.sin(angulo) }
      const ladoMesial = g.caras.derecha === "M" ? derecha : { x: -derecha.x, y: -derecha.y }
      // Desde el centro de la pieza, el lado mesial va hacia la línea media (o casi en vertical en los centrales).
      const haciaLaLinea = Math.sign(LINEA_MEDIA - g.centro.x)
      expect(Math.sign(ladoMesial.x)).toBe(haciaLaLinea)
    }
  })
})

describe("filasDeLaArcada", () => {
  it("de izquierda a derecha como se ven: arriba 18…11 21…28, abajo 48…41 31…38", () => {
    const [arriba, abajo] = filasDeLaArcada("permanente")
    expect(arriba).toEqual([18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28])
    expect(abajo).toEqual([48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38])
  })

  it("en la temporal, 55…51 61…65 y 85…81 71…75", () => {
    const [arriba, abajo] = filasDeLaArcada("temporal")
    expect(arriba).toEqual([55, 54, 53, 52, 51, 61, 62, 63, 64, 65])
    expect(abajo).toEqual([85, 84, 83, 82, 81, 71, 72, 73, 74, 75])
  })
})

describe("piezaVecina", () => {
  it("a los lados, por la fila y sin dar la vuelta", () => {
    expect(piezaVecina("permanente", 11, "ArrowRight")).toBe(21)
    expect(piezaVecina("permanente", 21, "ArrowLeft")).toBe(11)
    expect(piezaVecina("permanente", 18, "ArrowLeft")).toBe(18)
    expect(piezaVecina("permanente", 28, "ArrowRight")).toBe(28)
    expect(piezaVecina("permanente", 41, "ArrowRight")).toBe(31)
  })

  it("arriba y abajo, a la de la otra arcada en la misma columna", () => {
    expect(piezaVecina("permanente", 16, "ArrowDown")).toBe(46)
    expect(piezaVecina("permanente", 46, "ArrowUp")).toBe(16)
    expect(piezaVecina("permanente", 16, "ArrowUp")).toBe(16)
    expect(piezaVecina("temporal", 64, "ArrowDown")).toBe(74)
  })

  it("Inicio y Fin, a las puntas de la fila", () => {
    expect(piezaVecina("permanente", 13, "Home")).toBe(18)
    expect(piezaVecina("permanente", 13, "End")).toBe(28)
    expect(piezaVecina("temporal", 83, "End")).toBe(75)
  })

  it("una pieza de la otra dentición no se mueve", () => {
    expect(piezaVecina("temporal", 16, "ArrowRight")).toBe(16)
  })
})

describe("carasEnLaCruz", () => {
  it("mesial del lado de la línea media, como en el dibujo", () => {
    expect(carasEnLaCruz(16)).toEqual({ afuera: "V", adentro: "P", izquierda: "D", derecha: "M", centro: "O" })
    expect(carasEnLaCruz(21)).toEqual({ afuera: "V", adentro: "P", izquierda: "M", derecha: "D", centro: "I" })
    expect(carasEnLaCruz(36)).toEqual({ afuera: "V", adentro: "L", izquierda: "M", derecha: "D", centro: "O" })
    expect(carasEnLaCruz(83)).toEqual({ afuera: "V", adentro: "L", izquierda: "D", derecha: "M", centro: "I" })
  })
})
