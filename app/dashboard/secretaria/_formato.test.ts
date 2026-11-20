import { describe, expect, it } from "vitest"
import { formatearUsd, gastoEnUsd, leerPresupuestoUsd, porcentajeParaLaBarra, presupuestoEnUsd } from "./_formato"

describe("formato de la Secretaria", () => {
  it("muestra dólares con coma y dos decimales", () => {
    expect(formatearUsd(5)).toBe("US$5,00")
    expect(presupuestoEnUsd(500)).toBe("US$5,00")
    expect(presupuestoEnUsd(1250)).toBe("US$12,50")
  })

  it("lo gastado sale de microdólares, y lo de menos de un centavo no se ve como cero", () => {
    expect(gastoEnUsd(0)).toBe("US$0,00")
    expect(gastoEnUsd(3_000)).toBe("menos de US$0,01")
    expect(gastoEnUsd(1_234_567)).toBe("US$1,23")
  })

  it("la barra va de 0 a 100", () => {
    expect(porcentajeParaLaBarra(42.4)).toBe(42)
    expect(porcentajeParaLaBarra(130)).toBe(100)
    expect(porcentajeParaLaBarra(-1)).toBe(0)
    expect(porcentajeParaLaBarra(Number.NaN)).toBe(100)
  })

  it("lee el presupuesto que escribe la dueña", () => {
    expect(leerPresupuestoUsd("5")).toBe(5)
    expect(leerPresupuestoUsd("5,50")).toBe(5.5)
    expect(leerPresupuestoUsd("US$ 7.5")).toBe(7.5)
    expect(leerPresupuestoUsd("")).toBeNull()
    expect(leerPresupuestoUsd("-3")).toBeNull()
    expect(leerPresupuestoUsd("1,234")).toBeNull()
    expect(leerPresupuestoUsd("20000")).toBeNull()
  })
})
