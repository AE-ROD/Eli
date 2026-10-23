import { describe, it, expect } from "vitest"
import {
  calcularPrecio,
  DIAS_DE_PRUEBA,
  DIAS_EXTRA_POR_REFERIDO,
  formatearPesos,
  PERSONAS_INCLUIDAS_EQUIPO,
  PRECIO_EQUIPO,
  PRECIO_INDEPENDIENTE,
  PRECIO_PERSONA_ADICIONAL,
} from "./precios"

describe("los precios decididos", () => {
  it("son los de docs/PRODUCTO.md", () => {
    expect(PRECIO_INDEPENDIENTE).toBe(9990)
    expect(PRECIO_EQUIPO).toBe(34990)
    expect(PERSONAS_INCLUIDAS_EQUIPO).toBe(5)
    expect(PRECIO_PERSONA_ADICIONAL).toBe(4990)
    expect(DIAS_DE_PRUEBA).toBe(7)
    expect(DIAS_EXTRA_POR_REFERIDO).toBe(7)
  })
})

describe("calcularPrecio", () => {
  it("con una persona sugiere Independiente", () => {
    expect(calcularPrecio(1)).toEqual({
      plan: "independiente",
      montoBase: 9990,
      adicionales: 0,
      montoAdicional: 0,
      total: 9990,
    })
  })

  it("con dos personas pasa a Equipo, sin adicionales", () => {
    expect(calcularPrecio(2)).toEqual({
      plan: "equipo",
      montoBase: 34990,
      adicionales: 0,
      montoAdicional: 0,
      total: 34990,
    })
  })

  it("con cinco personas sigue sin adicionales: son las incluidas", () => {
    expect(calcularPrecio(5)).toMatchObject({ plan: "equipo", adicionales: 0, total: 34990 })
  })

  it("la sexta persona es la primera que se cobra aparte", () => {
    expect(calcularPrecio(6)).toEqual({
      plan: "equipo",
      montoBase: 34990,
      adicionales: 1,
      montoAdicional: 4990,
      total: 39980,
    })
  })

  it("con siete personas suma dos adicionales", () => {
    expect(calcularPrecio(7)).toMatchObject({ adicionales: 2, montoAdicional: 9980, total: 44970 })
  })

  it("con treinta personas suma veinticinco adicionales", () => {
    expect(calcularPrecio(30)).toMatchObject({ adicionales: 25, montoAdicional: 124750, total: 159740 })
  })

  it("rechaza cero, negativos y lo que no es un entero en vez de inventar un precio", () => {
    for (const invalida of [0, -1, -5, 1.5, 2.0001, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => calcularPrecio(invalida)).toThrow(RangeError)
    }
  })
})

describe("formatearPesos", () => {
  it("pone el punto de miles y ningún decimal", () => {
    expect(formatearPesos(9990)).toBe("$9.990")
    expect(formatearPesos(34990)).toBe("$34.990")
    expect(formatearPesos(4990)).toBe("$4.990")
    expect(formatearPesos(1234567)).toBe("$1.234.567")
  })

  it("escribe los montos chicos sin separador", () => {
    expect(formatearPesos(0)).toBe("$0")
    expect(formatearPesos(990)).toBe("$990")
  })

  it("redondea al peso y lleva el signo antes del `$`", () => {
    expect(formatearPesos(9990.4)).toBe("$9.990")
    expect(formatearPesos(-4990)).toBe("-$4.990")
  })
})
