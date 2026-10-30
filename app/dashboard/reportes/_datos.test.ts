import { describe, it, expect } from "vitest"
import { formatearCambio, formatearMinutos, formatearTasa } from "./_datos"

describe("formato de Llenar horas", () => {
  it("formatearTasa", () => {
    expect(formatearTasa(0.4249)).toBe("42 %")
    expect(formatearTasa(0)).toBe("0 %")
    expect(formatearTasa(null)).toBe("—")
  })

  it("formatearMinutos", () => {
    expect(formatearMinutos(0)).toBe("0 min")
    expect(formatearMinutos(45)).toBe("45 min")
    expect(formatearMinutos(120)).toBe("2 h")
    expect(formatearMinutos(750)).toBe("12 h 30 min")
  })

  it("formatearCambio: relativo en cantidades, puntos en tasas, nada sin base", () => {
    expect(formatearCambio({ actual: 5, anterior: 4, cambio: 0.25 }, "cantidad")).toBe("+25 %")
    expect(formatearCambio({ actual: 0.3, anterior: 0.35, cambio: -0.05 }, "tasa")).toBe("−5 pts")
    expect(formatearCambio({ actual: 1, anterior: 1, cambio: 0 }, "cantidad")).toBe("0 %")
    expect(formatearCambio({ actual: 3, anterior: 0, cambio: null }, "cantidad")).toBeNull()
  })
})
