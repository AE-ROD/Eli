import { describe, it, expect } from "vitest"
import { formatearPorcentaje, leerPorcentaje, porcentajeParaEscribir } from "./_datos"

describe("leerPorcentaje", () => {
  it.each([
    ["40", 40],
    ["33,33", 33.33],
    ["12.5", 12.5],
    ["0", 0],
    ["100", 100],
    [" 40 % ", 40],
  ])("%s → %s", (texto, valor) => {
    expect(leerPorcentaje(texto)).toEqual({ ok: true, valor })
  })

  it("vacío es sin configurar (null), no 0", () => {
    expect(leerPorcentaje("  ")).toEqual({ ok: true, valor: null })
  })

  it.each(["100,01", "101", "-5", "12,345", "abc", "1.000"])("%s no se adivina", (texto) => {
    expect(leerPorcentaje(texto).ok).toBe(false)
  })
})

describe("formatearPorcentaje", () => {
  it("con coma decimal y sin configurar", () => {
    expect(formatearPorcentaje(33.33)).toBe("33,33 %")
    expect(formatearPorcentaje(0)).toBe("0 %")
    expect(formatearPorcentaje(null)).toBe("Sin configurar")
  })

  it("para escribir, de vuelta a como se lee", () => {
    expect(porcentajeParaEscribir(33.33)).toBe("33,33")
    expect(porcentajeParaEscribir(null)).toBe("")
    expect(leerPorcentaje(porcentajeParaEscribir(12.5))).toEqual({ ok: true, valor: 12.5 })
  })
})
