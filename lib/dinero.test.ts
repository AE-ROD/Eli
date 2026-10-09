import { describe, it, expect } from "vitest"
import { formatearMonto, leerMonto, montoParaEscribir } from "./dinero"

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
  it("lee un entero, con espacios al borde", () => {
    expect(leerMonto("8000")).toBe(8000)
    expect(leerMonto(" 25000 ")).toBe(25000)
    expect(leerMonto("0")).toBe(0)
  })

  it("lee 8000,50, 8.000,50 y 8000.50 como el mismo monto (QA: la coma se perdía y daba 800050)", () => {
    expect(leerMonto("8000,50")).toBe(8000.5)
    expect(leerMonto("8.000,50")).toBe(8000.5)
    expect(leerMonto("8000.50")).toBe(8000.5)
  })

  it("el último signo es el decimal si lo siguen una o dos cifras, con coma o con punto", () => {
    expect(leerMonto("10,5")).toBe(10.5)
    expect(leerMonto("10.5")).toBe(10.5)
    expect(leerMonto("0,05")).toBe(0.05)
    expect(leerMonto(",5")).toBe(0.5)
    expect(leerMonto("8,000.50")).toBe(8000.5)
    expect(leerMonto("1.234.567,89")).toBe(1234567.89)
  })

  it("sin decimales, el punto separa miles en grupos de tres, como lo escribe formatearMonto", () => {
    expect(leerMonto("8.000")).toBe(8000)
    expect(leerMonto("25.000")).toBe(25000)
    expect(leerMonto("1.234.567")).toBe(1234567)
    // "$25.000" en pantalla, copiado al campo sin el signo, es veinticinco mil.
    expect(leerMonto(formatearMonto(25000).slice(1))).toBe(25000)
  })

  it("un separador al final, mientras se escriben los decimales, no cambia el monto", () => {
    expect(leerMonto("8000,")).toBe(8000)
    expect(leerMonto("8.000,")).toBe(8000)
  })

  it("lo que no se puede leer sin adivinar da null, nunca otro monto", () => {
    // Coma y tres cifras: un decimal de tres cifras en español, ocho mil en otros países.
    expect(leerMonto("8,000")).toBeNull()
    expect(leerMonto("10,005")).toBeNull()
    // Grupos de miles que no son de tres cifras, o miles con el mismo signo que el decimal.
    expect(leerMonto("8.0000")).toBeNull()
    expect(leerMonto("12.34.567")).toBeNull()
    expect(leerMonto("8000.500")).toBeNull()
    expect(leerMonto("1.234.5")).toBeNull()
    expect(leerMonto("8.000.000,5.5")).toBeNull()
    expect(leerMonto("0.125")).toBeNull()
    // Tres decimales no son un monto: no se redondean en silencio.
    expect(leerMonto("8,125")).toBeNull()
  })

  it("vacío o algo que no es un número da null, nunca un cero inventado", () => {
    expect(leerMonto("")).toBeNull()
    expect(leerMonto("   ")).toBeNull()
    expect(leerMonto("abc")).toBeNull()
    expect(leerMonto("Infinity")).toBeNull()
    expect(leerMonto("1e3")).toBeNull()
    expect(leerMonto("8 000")).toBeNull()
    expect(leerMonto(",")).toBeNull()
    expect(leerMonto("-")).toBeNull()
    expect(leerMonto("--5")).toBeNull()
  })

  it("no valida rangos: un negativo se lee tal cual y lo rechazan las reglas del cobro", () => {
    expect(leerMonto("-5")).toBe(-5)
    expect(leerMonto("-8.000,50")).toBe(-8000.5)
  })
})

describe("montoParaEscribir", () => {
  it("escribe como alguien a mano: sin miles y con coma decimal", () => {
    expect(montoParaEscribir(8000)).toBe("8000")
    expect(montoParaEscribir(25000.5)).toBe("25000,50")
    expect(montoParaEscribir(0.05)).toBe("0,05")
    expect(montoParaEscribir(0)).toBe("0")
  })

  it("leerMonto lo lee de vuelta igual, en cualquier monto con hasta dos decimales", () => {
    for (const monto of [0, 0.01, 0.1, 0.3, 1, 10.5, 999.99, 8000, 8000.5, 32999.9, 1234567.89, 20000000, -500.25]) {
      expect(leerMonto(montoParaEscribir(monto))).toBe(monto)
    }
  })

  it("no redondea: un precio con tres decimales sigue sin leerse, en vez de volverse otro", () => {
    expect(montoParaEscribir(10.005)).toBe("10,005")
    expect(leerMonto(montoParaEscribir(10.005))).toBeNull()
  })
})
