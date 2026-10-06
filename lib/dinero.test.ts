import { describe, it, expect } from "vitest"
import { formatearMonto, leerMonto } from "./dinero"

describe("formatearMonto", () => {
  it("escribe los enteros sin decimales, como el resto de la app", () => {
    expect(formatearMonto(25000)).toBe("$25.000")
    expect(formatearMonto(0)).toBe("$0")
  })

  it("coincide con el formato que ya usaban las vistas (`$` + toLocaleString es-ES)", () => {
    for (const monto of [8000, 25000, 1234567, 999]) {
      expect(formatearMonto(monto)).toBe(`$${monto.toLocaleString("es-ES")}`)
    }
  })

  it("con centavos muestra siempre dos decimales", () => {
    expect(formatearMonto(10.5)).toBe("$10,50")
    expect(formatearMonto(1234.05)).toBe(`$${(1234.05).toLocaleString("es-ES", { minimumFractionDigits: 2 })}`)
  })

  it("no arrastra el error de sumar decimales sueltos", () => {
    expect(formatearMonto(0.1 + 0.2)).toBe("$0,30")
  })

  it("un monto negativo lleva el signo antes del `$`", () => {
    expect(formatearMonto(-500)).toBe("-$500")
    expect(formatearMonto(-25000)).toBe("-$25.000")
  })
})

describe("leerMonto", () => {
  it("lee lo que entrega un campo numérico", () => {
    expect(leerMonto("8000")).toBe(8000)
    expect(leerMonto("10.5")).toBe(10.5)
    expect(leerMonto(" 25000 ")).toBe(25000)
  })

  it("acepta la coma decimal", () => {
    expect(leerMonto("10,5")).toBe(10.5)
  })

  it("vacío o algo que no es un número da null, nunca un cero inventado", () => {
    expect(leerMonto("")).toBeNull()
    expect(leerMonto("   ")).toBeNull()
    expect(leerMonto("abc")).toBeNull()
    expect(leerMonto("Infinity")).toBeNull()
  })

  it("no valida rangos: un negativo se lee tal cual y lo rechazan las reglas del cobro", () => {
    expect(leerMonto("-5")).toBe(-5)
  })
})
