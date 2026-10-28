import { describe, it, expect } from "vitest"
import { ESTADOS_SIN_RECORDATORIO, esDeMañana, fechaYHoraEnElNegocio, ventanaDeBusqueda } from "./recordatorios"

/** Martes 6 de octubre de 2026, 23:00 en Santiago (UTC-3): en UTC ya es el miércoles. */
const AHORA = new Date("2026-10-07T02:00:00.000Z")

describe("esDeMañana", () => {
  it("cuenta el día siguiente en el reloj del negocio, de las 00:00 a las 23:59", () => {
    expect(esDeMañana(new Date("2026-10-07T03:00:00.000Z"), AHORA, "America/Santiago")).toBe(true) // mié 00:00
    expect(esDeMañana(new Date("2026-10-08T02:59:00.000Z"), AHORA, "America/Santiago")).toBe(true) // mié 23:59
  })

  it("no cuenta hoy ni pasado mañana, aunque en UTC caigan en 'mañana'", () => {
    expect(esDeMañana(new Date("2026-10-07T02:30:00.000Z"), AHORA, "America/Santiago")).toBe(false) // mar 23:30
    expect(esDeMañana(new Date("2026-10-08T03:00:00.000Z"), AHORA, "America/Santiago")).toBe(false) // jue 00:00
  })

  it("una zona guardada inválida cae en la del negocio por defecto (Santiago)", () => {
    expect(esDeMañana(new Date("2026-10-07T03:00:00.000Z"), AHORA, "no/es-una-zona")).toBe(true)
    expect(esDeMañana(new Date("2026-10-07T03:00:00.000Z"), AHORA, null)).toBe(true)
  })

  it("el día del cambio de hora (Santiago, 6/9/2026, sin 00:00) sigue siendo un día entero", () => {
    const sabado = new Date("2026-09-05T15:00:00.000Z") // sábado 5, 11:00 (UTC-4)
    expect(esDeMañana(new Date("2026-09-06T04:00:00.000Z"), sabado, "America/Santiago")).toBe(true) // dom 01:00 (UTC-3)
    expect(esDeMañana(new Date("2026-09-07T02:59:00.000Z"), sabado, "America/Santiago")).toBe(true) // dom 23:59
    expect(esDeMañana(new Date("2026-09-07T03:00:00.000Z"), sabado, "America/Santiago")).toBe(false) // lun 00:00
  })
})

describe("ventanaDeBusqueda", () => {
  it("cubre todo 'mañana' en cualquier zona: desde ahora hasta 50 horas después", () => {
    const { desde, hasta } = ventanaDeBusqueda(AHORA)
    expect(desde).toEqual(AHORA)
    expect(hasta.getTime() - AHORA.getTime()).toBe(50 * 60 * 60 * 1000)
  })
})

describe("fechaYHoraEnElNegocio", () => {
  it("da la fecha calendario y la hora HH:MM del negocio, no las de UTC", () => {
    expect(fechaYHoraEnElNegocio(new Date("2026-10-07T02:30:00.000Z"), "America/Santiago")).toEqual({
      fecha: "2026-10-06",
      hora: "23:30",
    })
  })
})

describe("ESTADOS_SIN_RECORDATORIO", () => {
  it("deja afuera las canceladas, las completadas y las de quien no vino", () => {
    expect([...ESTADOS_SIN_RECORDATORIO].sort()).toEqual(["cancelada", "completada", "no-asistio"])
  })
})
