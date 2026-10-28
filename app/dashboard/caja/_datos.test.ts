import { describe, it, expect } from "vitest"
import { cuentaEnPantalla } from "./_datos"

describe("cuentaEnPantalla", () => {
  const abierta = { efectivoCobrado: 8000.1, propinasEfectivo: 2000.2 }

  it("esperado y diferencia al centavo, sin error de punto flotante", () => {
    expect(cuentaEnPantalla(abierta, "10.000", "20.000,30")).toEqual({
      fondo: 10000,
      contado: 20000.3,
      esperado: 20000.3,
      diferencia: 0,
    })
  })

  it("falta lo contado: no hay diferencia todavía", () => {
    expect(cuentaEnPantalla(abierta, "0", "")).toMatchObject({ esperado: 10000.3, diferencia: null })
  })

  it("un monto que no se entiende o negativo no se adivina", () => {
    expect(cuentaEnPantalla(abierta, "abc", "10")).toMatchObject({ fondo: null, esperado: null, diferencia: null })
    expect(cuentaEnPantalla(abierta, "-5", "10").fondo).toBeNull()
  })

  it("faltó plata: diferencia negativa", () => {
    expect(cuentaEnPantalla(abierta, "0", "9.000").diferencia).toBe(-1000.3)
  })
})
