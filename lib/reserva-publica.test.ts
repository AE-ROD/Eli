import { describe, it, expect } from "vitest"
import { DIAS_MAXIMOS_DE_ANTICIPACION, fechaNoReservable, yaPasoLaHora } from "./reserva-publica"

/**
 * Esperados a mano, independientes de la zona de la máquina: el 19/10/2026 a
 * las 13:30 UTC son las 10:30 en Santiago (UTC-3) y las 22:30 en Tokio
 * (UTC+9); a las 02:00 UTC del 19 en Santiago todavía es el 18 a las 23:00.
 */
const SANTIAGO = "America/Santiago"
const TOKIO = "Asia/Tokyo"
const LUNES_10_30_SANTIAGO = new Date("2026-10-19T13:30:00.000Z")

describe("DIAS_MAXIMOS_DE_ANTICIPACION", () => {
  it("es 90", () => {
    expect(DIAS_MAXIMOS_DE_ANTICIPACION).toBe(90)
  })
})

describe("fechaNoReservable", () => {
  it.each([
    ["hoy", "2026-10-19", null],
    ["mañana", "2026-10-20", null],
    ["ayer", "2026-10-18", "pasada"],
    ["a 90 días (17/1/2027)", "2027-01-17", null],
    ["a 91 días (18/1/2027)", "2027-01-18", "muy-lejana"],
    ["el último día aceptado como fecha", "9998-12-31", "muy-lejana"],
    ["el primer año aceptado", "1900-01-01", "pasada"],
  ])("%s en Santiago: %s → %s", (_caso, fecha, esperado) => {
    expect(fechaNoReservable(fecha, LUNES_10_30_SANTIAGO, SANTIAGO)).toBe(esperado)
  })

  it("'hoy' es el del negocio: a las 02:00 UTC del 19, en Santiago todavía es el 18", () => {
    const ahora = new Date("2026-10-19T02:00:00.000Z")
    expect(fechaNoReservable("2026-10-18", ahora, SANTIAGO)).toBeNull()
    expect(fechaNoReservable("2026-10-18", ahora, "UTC")).toBe("pasada")
  })
})

describe("yaPasoLaHora", () => {
  it.each([
    ["hoy, antes de ahora", "2026-10-19", "10:00", true],
    ["hoy, la hora en curso", "2026-10-19", "10:30", true],
    ["hoy, un minuto después", "2026-10-19", "10:31", false],
    ["ayer, más tarde que ahora", "2026-10-18", "23:00", true],
    ["mañana, más temprano que ahora", "2026-10-20", "08:00", false],
  ])("%s en Santiago (%s %s) → %s", (_caso, fecha, hora, esperado) => {
    expect(yaPasoLaHora(fecha, hora, LUNES_10_30_SANTIAGO, SANTIAGO)).toBe(esperado)
  })

  it("con el reloj de Tokio, a las 13:30 UTC del 19 ya son las 22:30", () => {
    expect(yaPasoLaHora("2026-10-19", "22:00", LUNES_10_30_SANTIAGO, TOKIO)).toBe(true)
    expect(yaPasoLaHora("2026-10-19", "23:00", LUNES_10_30_SANTIAGO, TOKIO)).toBe(false)
  })
})
