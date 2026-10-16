import { describe, it, expect } from "vitest"
import { comoTexto } from "./fechas"
import { DIAS_MAXIMOS, PERIODOS, rangoDePeriodo, rangoPersonalizado } from "./periodos"

/** Un miércoles a media tarde. */
const HOY = new Date(2026, 2, 11, 15, 30)

/** El rango como textos de día: `hasta` es exclusivo, así que es el día siguiente al último. */
const comoDias = (rango: { desde: Date; hasta: Date }) => [comoTexto(rango.desde), comoTexto(rango.hasta)]

const esMedianoche = (fecha: Date) =>
  fecha.getHours() === 0 && fecha.getMinutes() === 0 && fecha.getSeconds() === 0 && fecha.getMilliseconds() === 0

describe("PERIODOS", () => {
  it("son los cinco de la ficha, en orden", () => {
    expect(PERIODOS.map((periodo) => periodo.nombre)).toEqual([
      "Hoy",
      "Ayer",
      "Esta semana",
      "Este mes",
      "Personalizado",
    ])
  })
})

describe("rangoDePeriodo", () => {
  it("hoy va de la medianoche de hoy a la de mañana", () => {
    expect(comoDias(rangoDePeriodo("hoy", HOY))).toEqual(["2026-03-11", "2026-03-12"])
  })

  it("ayer es el día anterior entero", () => {
    expect(comoDias(rangoDePeriodo("ayer", HOY))).toEqual(["2026-03-10", "2026-03-11"])
  })

  it("ayer de un primero de mes es el último día del mes anterior", () => {
    expect(comoDias(rangoDePeriodo("ayer", new Date(2026, 2, 1, 9)))).toEqual(["2026-02-28", "2026-03-01"])
  })

  it("la semana va de domingo a sábado, como la agenda", () => {
    expect(comoDias(rangoDePeriodo("semana", HOY))).toEqual(["2026-03-08", "2026-03-15"])
  })

  it("el mes va del primero al primero del mes siguiente", () => {
    expect(comoDias(rangoDePeriodo("mes", HOY))).toEqual(["2026-03-01", "2026-04-01"])
    expect(comoDias(rangoDePeriodo("mes", new Date(2026, 11, 20)))).toEqual(["2026-12-01", "2027-01-01"])
  })

  it("todos los rangos empiezan y terminan a medianoche local", () => {
    for (const periodo of ["hoy", "ayer", "semana", "mes"] as const) {
      const { desde, hasta } = rangoDePeriodo(periodo, HOY)
      expect(esMedianoche(desde)).toBe(true)
      expect(esMedianoche(hasta)).toBe(true)
      expect(hasta > desde).toBe(true)
    }
  })

  it("no modifica la fecha que recibe", () => {
    const hoy = new Date(HOY)
    rangoDePeriodo("semana", hoy)
    rangoDePeriodo("ayer", hoy)
    expect(hoy).toEqual(HOY)
  })
})

describe("rangoPersonalizado", () => {
  it("incluye los dos días: el fin es la medianoche del día siguiente al último", () => {
    const rango = rangoPersonalizado("2026-03-01", "2026-03-03")
    expect(rango.ok && comoDias(rango)).toEqual(["2026-03-01", "2026-03-04"])
  })

  it("un solo día vale", () => {
    const rango = rangoPersonalizado("2026-03-08", "2026-03-08")
    expect(rango.ok && comoDias(rango)).toEqual(["2026-03-08", "2026-03-09"])
  })

  it("sin alguna de las fechas pide completarlas", () => {
    expect(rangoPersonalizado("", "2026-03-03")).toEqual({ ok: false, error: "Elige la fecha de inicio y la de fin." })
    expect(rangoPersonalizado("2026-03-01", "")).toEqual({ ok: false, error: "Elige la fecha de inicio y la de fin." })
    expect(rangoPersonalizado("2026-02-31", "2026-03-03").ok).toBe(false)
  })

  it("un fin anterior al inicio se rechaza con un mensaje que dice qué corregir", () => {
    expect(rangoPersonalizado("2026-03-05", "2026-03-01")).toEqual({
      ok: false,
      error: "La fecha de fin no puede ser anterior a la de inicio.",
    })
  })

  it(`acepta hasta ${DIAS_MAXIMOS} días y rechaza uno más, como el endpoint`, () => {
    expect(rangoPersonalizado("2028-01-01", "2028-12-31").ok).toBe(true)
    const largo = rangoPersonalizado("2026-01-01", "2027-01-02")
    expect(largo.ok).toBe(false)
    expect(!largo.ok && largo.error).toContain(`${DIAS_MAXIMOS} días`)
  })
})
