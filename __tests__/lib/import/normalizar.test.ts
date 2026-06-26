import { describe, expect, it } from "vitest"
import { normalizarNombre, parsearFechaChilena, parsearMontoCLP } from "@/lib/import/normalizar"

describe("normalizar import", () => {
  it("parsea fechas chilenas válidas con guion y slash", () => {
    expect(parsearFechaChilena("05-03-2024")).toEqual(new Date(2024, 2, 5))
    expect(parsearFechaChilena("5/3/2024")).toEqual(new Date(2024, 2, 5))
  })

  it("devuelve null para fechas rotas", () => {
    expect(parsearFechaChilena("#REF!")).toBeNull()
    expect(parsearFechaChilena("")).toBeNull()
    expect(parsearFechaChilena("martes")).toBeNull()
    expect(parsearFechaChilena("31-02-2024")).toBeNull()
  })

  it("parsea montos CLP válidos", () => {
    expect(parsearMontoCLP("1.250")).toBe(1250)
    expect(parsearMontoCLP("1250")).toBe(1250)
    expect(parsearMontoCLP("1.250.000")).toBe(1250000)
  })

  it("devuelve null para montos rotos", () => {
    expect(parsearMontoCLP("#REF!")).toBeNull()
    expect(parsearMontoCLP("")).toBeNull()
    expect(parsearMontoCLP("texto")).toBeNull()
    expect(parsearMontoCLP("1.250,50")).toBeNull()
  })

  it("normaliza nombres para matching", () => {
    expect(normalizarNombre("  María José Álvarez  ")).toBe("maria jose alvarez")
  })
})
