import { describe, it, expect } from "vitest"
import {
  comoTexto,
  diasDeLaSemanaDe,
  limitesDelMesDe,
  correr,
  formatearHora,
  duracionEnMinutos,
} from "./fechas"

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

describe("formatearHora", () => {
  // Se arma con `new Date(año, mes, ...)` y `toISOString()` a propósito: ida y
  // vuelta por la zona local, así el test da lo mismo en cualquier huso. Es un
  // 15 de julio porque ningún huso cambia la hora ese día: en un día de cambio
  // (8 de marzo en La Habana, por ejemplo) la 00:30 ni siquiera existe.
  const instante = (hora: number, minuto: number) =>
    new Date(2026, 6, 15, hora, minuto).toISOString()

  it("escribe la hora local en 24h, con cero a la izquierda", () => {
    expect(formatearHora(instante(9, 5))).toBe("09:05")
    expect(formatearHora(instante(21, 30))).toBe("21:30")
  })

  it("la hora de la tarde sigue en 24h, sin am/pm", () => {
    expect(formatearHora(instante(14, 0))).toBe("14:00")
  })

  it("después de medianoche empieza en 00, no en 24", () => {
    expect(formatearHora(instante(0, 30))).toBe("00:30")
  })
})

describe("duracionEnMinutos", () => {
  it("cuenta los minutos entre el inicio y el fin de la cita", () => {
    expect(duracionEnMinutos("2026-03-08T10:00:00.000Z", "2026-03-08T10:45:00.000Z")).toBe(45)
  })

  it("cruza la hora y la medianoche sin perder minutos", () => {
    expect(duracionEnMinutos("2026-03-08T23:30:00.000Z", "2026-03-09T01:00:00.000Z")).toBe(90)
  })

  it("una cita que termina cuando empieza dura cero", () => {
    expect(duracionEnMinutos("2026-03-08T10:00:00.000Z", "2026-03-08T10:00:00.000Z")).toBe(0)
  })

  it("redondea al minuto más cercano", () => {
    expect(duracionEnMinutos("2026-03-08T10:00:00.000Z", "2026-03-08T10:00:29.000Z")).toBe(0)
    expect(duracionEnMinutos("2026-03-08T10:00:00.000Z", "2026-03-08T10:00:31.000Z")).toBe(1)
  })
})
