import { describe, it, expect } from "vitest"
import { comoTexto, diasDeLaSemanaDe, limitesDelMesDe, correr } from "./fechas"

describe("comoTexto", () => {
  it("escribe la fecha local, no la UTC", () => {
    // 21:00 en un huso al oeste de Greenwich ya es el día siguiente en UTC.
    // `toISOString()` devolvería el día de después y correría toda la semana.
    const nocheDelOcho = new Date(2026, 2, 8, 21, 0, 0)
    expect(comoTexto(nocheDelOcho)).toBe("2026-03-08")
  })

  it("rellena mes y día con cero", () => {
    expect(comoTexto(new Date(2026, 0, 5))).toBe("2026-01-05")
  })
})

describe("diasDeLaSemanaDe", () => {
  it("devuelve siete días, de domingo a sábado", () => {
    const miercoles = new Date(2026, 2, 11)
    const dias = diasDeLaSemanaDe(miercoles)

    expect(dias).toHaveLength(7)
    expect(dias.map(comoTexto)).toEqual([
      "2026-03-08", "2026-03-09", "2026-03-10", "2026-03-11",
      "2026-03-12", "2026-03-13", "2026-03-14",
    ])
  })

  it("cruza el cambio de mes sin repetir ni saltear días", () => {
    const dias = diasDeLaSemanaDe(new Date(2026, 1, 25))
    expect(dias.map(comoTexto)).toEqual([
      "2026-02-22", "2026-02-23", "2026-02-24", "2026-02-25",
      "2026-02-26", "2026-02-27", "2026-02-28",
    ])
  })

  it("no modifica la fecha que recibe", () => {
    const original = new Date(2026, 2, 11)
    diasDeLaSemanaDe(original)
    expect(comoTexto(original)).toBe("2026-03-11")
  })
})

describe("limitesDelMesDe", () => {
  it("toma el mes entero", () => {
    const { desde, hasta } = limitesDelMesDe(new Date(2026, 2, 17))
    expect(comoTexto(desde)).toBe("2026-03-01")
    expect(comoTexto(hasta)).toBe("2026-03-31")
  })

  it("acierta el último día de febrero en un año bisiesto", () => {
    expect(comoTexto(limitesDelMesDe(new Date(2028, 1, 10)).hasta)).toBe("2028-02-29")
  })
})

describe("correr", () => {
  it("mueve por día, por semana y por mes", () => {
    const base = new Date(2026, 2, 11)
    expect(comoTexto(correr(base, "dia", 1))).toBe("2026-03-12")
    expect(comoTexto(correr(base, "semana", -1))).toBe("2026-03-04")
    expect(comoTexto(correr(base, "mes", 1))).toBe("2026-04-11")
  })

  it("no modifica la fecha que recibe", () => {
    const original = new Date(2026, 2, 11)
    correr(original, "mes", 3)
    expect(comoTexto(original)).toBe("2026-03-11")
  })
})
