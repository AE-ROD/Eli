import { describe, it, expect } from "vitest"
import {
  ZONA_POR_DEFECTO,
  diaDeLaSemana,
  esFechaCalendario,
  esHoraDelDia,
  esZonaValida,
  fechaYMinutosEn,
  instanteEn,
  rangoDelDiaEn,
  sumarDias,
  zonaDelNegocio,
} from "./zona-horaria"

/**
 * Todos los esperados están escritos a mano (calendario y tablas de husos),
 * nunca calculados con `Date` local: la suite corre igual con TZ=UTC,
 * TZ=America/Santiago y TZ=Asia/Tokyo.
 *
 * Santiago 2026: UTC-3 hasta el sábado 4 de abril a las 24:00, cuando vuelve
 * a las 23:00 (UTC-4); UTC-4 hasta el sábado 5 de septiembre a las 24:00,
 * cuando salta a la 01:00 del domingo 6 (UTC-3).
 */

const SANTIAGO = "America/Santiago"
const BOGOTA = "America/Bogota"
const TOKIO = "Asia/Tokyo"

describe("diaDeLaSemana", () => {
  it("2026-10-19 es lunes, siempre", () => {
    expect(diaDeLaSemana("2026-10-19")).toBe(1)
  })

  it.each([
    ["2026-10-18", 0], // domingo
    ["2026-10-24", 6], // sábado
    ["2026-01-01", 4], // jueves
    ["2024-02-29", 4], // jueves, bisiesto
    ["2026-09-06", 0], // domingo del cambio de hora en Chile
  ])("%s → %i", (fecha, dia) => {
    expect(diaDeLaSemana(fecha)).toBe(dia)
  })

  it("lanza con una fecha que no existe o mal escrita", () => {
    expect(() => diaDeLaSemana("2026-02-30")).toThrow(RangeError)
    expect(() => diaDeLaSemana("xyz")).toThrow(RangeError)
  })
})

describe("validaciones", () => {
  it("fechas calendario", () => {
    expect(esFechaCalendario("2026-10-19")).toBe(true)
    expect(esFechaCalendario("2024-02-29")).toBe(true)
    expect(esFechaCalendario("2026-02-29")).toBe(false)
    expect(esFechaCalendario("2026-13-01")).toBe(false)
    expect(esFechaCalendario("2026-10-19T00:00")).toBe(false)
  })

  it("horas del día", () => {
    expect(esHoraDelDia("00:00")).toBe(true)
    expect(esHoraDelDia("23:59")).toBe(true)
    expect(esHoraDelDia("24:00")).toBe(false)
    expect(esHoraDelDia("99:00")).toBe(false)
    expect(esHoraDelDia("9:00")).toBe(false)
  })

  it("zonas: IANA sí; desfases, basura y vacíos no", () => {
    expect(esZonaValida(SANTIAGO)).toBe(true)
    expect(esZonaValida("UTC")).toBe(true)
    expect(esZonaValida(TOKIO)).toBe(true)
    expect(esZonaValida("-03:00")).toBe(false)
    expect(esZonaValida("Marte/Olympus")).toBe(false)
    expect(esZonaValida("")).toBe(false)
    expect(esZonaValida(null)).toBe(false)
  })

  it("zonaDelNegocio cae en America/Santiago si lo guardado no sirve", () => {
    expect(ZONA_POR_DEFECTO).toBe("America/Santiago")
    expect(zonaDelNegocio(BOGOTA)).toBe(BOGOTA)
    expect(zonaDelNegocio("Marte/Olympus")).toBe(SANTIAGO)
    expect(zonaDelNegocio(null)).toBe(SANTIAGO)
    expect(zonaDelNegocio(undefined)).toBe(SANTIAGO)
  })
})

describe("sumarDias", () => {
  it("cruza meses y años", () => {
    expect(sumarDias("2026-10-19", 1)).toBe("2026-10-20")
    expect(sumarDias("2026-10-31", 1)).toBe("2026-11-01")
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01")
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28")
  })
})

describe("instanteEn", () => {
  it.each([
    [SANTIAGO, "2026-10-19", "10:00", "2026-10-19T13:00:00.000Z"], // verano, UTC-3
    [SANTIAGO, "2026-07-15", "10:00", "2026-07-15T14:00:00.000Z"], // invierno, UTC-4
    ["UTC", "2026-10-19", "10:00", "2026-10-19T10:00:00.000Z"],
    [BOGOTA, "2026-10-19", "10:00", "2026-10-19T15:00:00.000Z"], // UTC-5, sin cambio de hora
    [TOKIO, "2026-10-19", "10:00", "2026-10-19T01:00:00.000Z"], // UTC+9
    [TOKIO, "2026-10-19", "08:00", "2026-10-18T23:00:00.000Z"], // el día anterior en UTC
    [SANTIAGO, "2026-10-19", "22:30", "2026-10-20T01:30:00.000Z"], // el día siguiente en UTC
  ])("%s %s %s → %s", (zona, fecha, hora, esperado) => {
    expect(instanteEn(fecha, hora, zona).toISOString()).toBe(esperado)
  })

  it("Santiago, víspera y día del salto de septiembre", () => {
    expect(instanteEn("2026-09-05", "23:30", SANTIAGO).toISOString()).toBe("2026-09-06T03:30:00.000Z")
    expect(instanteEn("2026-09-06", "01:00", SANTIAGO).toISOString()).toBe("2026-09-06T04:00:00.000Z")
    expect(instanteEn("2026-09-06", "10:00", SANTIAGO).toISOString()).toBe("2026-09-06T13:00:00.000Z")
  })

  it("Santiago, hora que no existe (6/9 00:30): se corre lo que dura el salto, a la 01:30", () => {
    expect(instanteEn("2026-09-06", "00:30", SANTIAGO).toISOString()).toBe("2026-09-06T04:30:00.000Z")
    expect(instanteEn("2026-09-06", "00:00", SANTIAGO).toISOString()).toBe("2026-09-06T04:00:00.000Z")
  })

  it("Santiago, hora que ocurre dos veces (4/4 23:30): la primera, todavía en UTC-3", () => {
    expect(instanteEn("2026-04-04", "23:30", SANTIAGO).toISOString()).toBe("2026-04-05T02:30:00.000Z")
    expect(instanteEn("2026-04-04", "22:59", SANTIAGO).toISOString()).toBe("2026-04-05T01:59:00.000Z")
    expect(instanteEn("2026-04-05", "00:00", SANTIAGO).toISOString()).toBe("2026-04-05T04:00:00.000Z")
  })

  it("una zona inválida usa la del negocio por defecto; fecha u hora inválidas lanzan", () => {
    expect(instanteEn("2026-10-19", "10:00", "Marte/Olympus").toISOString()).toBe("2026-10-19T13:00:00.000Z")
    expect(() => instanteEn("2026-02-30", "10:00", SANTIAGO)).toThrow(RangeError)
    expect(() => instanteEn("2026-10-19", "24:00", SANTIAGO)).toThrow(RangeError)
  })
})

describe("rangoDelDiaEn", () => {
  it.each([
    [SANTIAGO, "2026-10-19", "2026-10-19T03:00:00.000Z", "2026-10-20T03:00:00.000Z"],
    ["UTC", "2026-10-19", "2026-10-19T00:00:00.000Z", "2026-10-20T00:00:00.000Z"],
    [BOGOTA, "2026-10-19", "2026-10-19T05:00:00.000Z", "2026-10-20T05:00:00.000Z"],
    [TOKIO, "2026-10-19", "2026-10-18T15:00:00.000Z", "2026-10-19T15:00:00.000Z"],
    // Día del salto: empieza a la 01:00 y dura 23 horas.
    [SANTIAGO, "2026-09-06", "2026-09-06T04:00:00.000Z", "2026-09-07T03:00:00.000Z"],
    // Víspera del retroceso: dura 25 horas.
    [SANTIAGO, "2026-04-04", "2026-04-04T03:00:00.000Z", "2026-04-05T04:00:00.000Z"],
  ])("%s %s → [%s, %s)", (zona, fecha, desde, hasta) => {
    const rango = rangoDelDiaEn(fecha, zona)
    expect(rango.desde.toISOString()).toBe(desde)
    expect(rango.hasta.toISOString()).toBe(hasta)
  })
})

describe("fechaYMinutosEn", () => {
  it.each([
    ["2026-10-19T13:00:00.000Z", SANTIAGO, "2026-10-19", 600],
    ["2026-10-20T02:30:00.000Z", SANTIAGO, "2026-10-19", 23 * 60 + 30], // en UTC ya es martes
    ["2026-10-19T13:00:00.000Z", "UTC", "2026-10-19", 780],
    ["2026-10-19T13:00:00.000Z", BOGOTA, "2026-10-19", 480],
    ["2026-10-19T16:00:00.000Z", TOKIO, "2026-10-20", 60],
    ["2026-09-06T04:00:00.000Z", SANTIAGO, "2026-09-06", 60], // primer instante del día del salto
    ["2026-04-05T03:30:00.000Z", SANTIAGO, "2026-04-04", 23 * 60 + 30], // la segunda vez de las 23:30
  ])("%s en %s → %s, minuto %i", (iso, zona, fecha, minutos) => {
    expect(fechaYMinutosEn(new Date(iso), zona)).toEqual({ fecha, minutos })
  })

  it("es el inverso de instanteEn fuera de los cambios de hora", () => {
    const instante = instanteEn("2026-10-19", "17:45", TOKIO)
    expect(fechaYMinutosEn(instante, TOKIO)).toEqual({ fecha: "2026-10-19", minutos: 17 * 60 + 45 })
  })
})
