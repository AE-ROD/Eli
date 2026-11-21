import { describe, expect, it } from "vitest"
import { porcentajeParaLaBarra } from "./_formato"

describe("formato de la Secretaria", () => {
  it("la barra va de 0 a 100", () => {
    expect(porcentajeParaLaBarra(42.4)).toBe(42)
    expect(porcentajeParaLaBarra(130)).toBe(100)
    expect(porcentajeParaLaBarra(-1)).toBe(0)
    expect(porcentajeParaLaBarra(Number.NaN)).toBe(100)
  })
})
