import { describe, it, expect } from "vitest"
import { caeEnElDia, diaLargoEn, esHoyEn, fechaEn, horaEn, hoyEn, isoEn } from "./_hora-del-negocio"

const SANTIAGO = "America/Santiago"
const TOKIO = "Asia/Tokyo"

// 20/10/2026 13:00 UTC: las 10:00 en Santiago (UTC-3) y las 22:00 en Tokio (UTC+9).
const INSTANTE = "2026-10-20T13:00:00.000Z"

describe("la hora del negocio, no la del navegador (#99)", () => {
  it("la hora y el día salen de la zona del negocio", () => {
    expect(horaEn(INSTANTE, SANTIAGO)).toBe("10:00")
    expect(horaEn(INSTANTE, TOKIO)).toBe("22:00")
    expect(fechaEn("2026-10-20T16:30:00.000Z", TOKIO)).toBe("2026-10-21")
    expect(fechaEn("2026-10-20T16:30:00.000Z", SANTIAGO)).toBe("2026-10-20")
  })

  it("caer en un día es caer en ese día del negocio", () => {
    const dia20 = new Date(2026, 9, 20)
    expect(caeEnElDia("2026-10-21T02:00:00.000Z", dia20, SANTIAGO)).toBe(true) // 23:00 del 20 en Santiago
    expect(caeEnElDia("2026-10-21T02:00:00.000Z", dia20, TOKIO)).toBe(false) // 11:00 del 21 en Tokio
  })

  it("escribir una fecha y una hora es ese instante en la zona del negocio", () => {
    expect(isoEn("2026-10-20", "10:00", SANTIAGO)).toBe(INSTANTE)
    expect(isoEn("2026-10-20", "22:00", TOKIO)).toBe(INSTANTE)
  })

  it("lo que no es fecha u hora: null, sin llamar a nadie", () => {
    expect(isoEn("2026-02-30", "10:00", SANTIAGO)).toBeNull()
    expect(isoEn("2026-10-20", "25:00", SANTIAGO)).toBeNull()
    expect(isoEn("", "", SANTIAGO)).toBeNull()
  })

  it("hoy es el día del negocio: a las 23:00 en Santiago, en Tokio ya es mañana", () => {
    const ahora = new Date("2026-10-21T02:00:00.000Z")
    expect(hoyEn(SANTIAGO, ahora)).toEqual(new Date(2026, 9, 20))
    expect(hoyEn(TOKIO, ahora)).toEqual(new Date(2026, 9, 21))
    expect(esHoyEn(new Date(2026, 9, 20), SANTIAGO, ahora)).toBe(true)
    expect(esHoyEn(new Date(2026, 9, 20), TOKIO, ahora)).toBe(false)
  })

  it("el día para leer es el del negocio", () => {
    expect(diaLargoEn("2026-10-20T16:30:00.000Z", TOKIO)).toBe(new Date(2026, 9, 21).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" }))
  })

  it("una zona inválida cae en la de por defecto (Santiago), como en el servidor", () => {
    expect(horaEn(INSTANTE, "no/es-una-zona")).toBe("10:00")
  })
})
