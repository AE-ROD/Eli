import { describe, it, expect } from "vitest"
import { MAXIMO_DE_PROPINAS } from "./atenciones"
import { errorDePropinas } from "./propinas"

describe("errorDePropinas (#66)", () => {
  const propina = { profesional: "m-carla", monto: 2000, medio: "efectivo" }

  it("sin propinas o con propinas válidas, nada que decir", () => {
    expect(errorDePropinas([])).toBeNull()
    expect(errorDePropinas([propina, { ...propina, profesional: "duenio", monto: 0.5 }])).toBeNull()
  })

  it("un medio que no está en el catálogo", () => {
    expect(errorDePropinas([{ ...propina, medio: "cheque" }])).toBe("Hay una propina con un medio de pago que no existe.")
  })

  it("un monto que no es mayor que cero con hasta dos decimales", () => {
    for (const monto of [0, -1, 0.001, Number.NaN, 30_000_000]) {
      expect(errorDePropinas([{ ...propina, monto }])).toBe("Cada propina tiene que ser mayor que cero y con hasta dos decimales.")
    }
  })

  it(`más de ${MAXIMO_DE_PROPINAS}`, () => {
    expect(errorDePropinas(Array.from({ length: MAXIMO_DE_PROPINAS + 1 }, () => propina))).toBe("Hasta 5 propinas por cobro.")
  })
})
