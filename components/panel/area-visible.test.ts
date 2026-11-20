import { describe, expect, it } from "vitest"
import { areaVisible } from "./area-visible"

describe("areaVisible", () => {
  it("sin teclado se ve la ventana entera: la hoja queda como siempre", () => {
    expect(areaVisible(664, { alto: 664, desplazamiento: 0, escala: 1 })).toBeNull()
    // Medio píxel de redondeo no es un teclado.
    expect(areaVisible(664, { alto: 663.5, desplazamiento: 0, escala: 1 })).toBeNull()
  })

  it("con el teclado abierto, la capa ocupa lo que queda encima de él", () => {
    expect(areaVisible(664, { alto: 328, desplazamiento: 0, escala: 1 })).toEqual({ top: 0, height: 328 })
  })

  it("si el navegador corrió lo que se ve (iPhone), la capa se corre igual", () => {
    expect(areaVisible(664, { alto: 330.4, desplazamiento: 120.6, escala: 1 })).toEqual({ top: 121, height: 330 })
  })

  it("con zoom no se toca: lo que se ve es un recorte elegido, no el teclado", () => {
    expect(areaVisible(664, { alto: 332, desplazamiento: 40, escala: 2 })).toBeNull()
  })

  it("sin visualViewport (navegador viejo) o con un alto imposible, nada cambia", () => {
    expect(areaVisible(664, null)).toBeNull()
    expect(areaVisible(664, { alto: 0, desplazamiento: 0, escala: 1 })).toBeNull()
  })
})
