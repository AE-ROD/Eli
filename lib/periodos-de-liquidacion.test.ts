import { describe, it, expect } from "vitest"
import {
  configuracionDelNegocio,
  fechaDeColumna,
  fechaDelNegocio,
  fechaParaColumna,
  finDelPeriodoEn,
  inicioDelPeriodoEn,
  periodoParaLeer,
  periodoQueContiene,
  proximoPeriodo,
  type ConfiguracionDePeriodo,
} from "./periodos-de-liquidacion"

/**
 * Esperados escritos a mano. Santiago 2026: UTC-3 hasta el sábado 4 de abril
 * a las 24:00 (vuelve a las 23:00, UTC-4); el domingo 6 de septiembre salta
 * de las 00:00 a la 01:00 (UTC-3).
 */
const SANTIAGO = "America/Santiago"
const mensual: ConfiguracionDePeriodo = { periodo: "mensual", inicioSemana: 1 }
const quincenal: ConfiguracionDePeriodo = { periodo: "quincenal", inicioSemana: 1 }
const semanalLunes: ConfiguracionDePeriodo = { periodo: "semanal", inicioSemana: 1 }
const semanalDomingo: ConfiguracionDePeriodo = { periodo: "semanal", inicioSemana: 0 }

describe("periodoQueContiene", () => {
  it("mensual: del 1 al último día", () => {
    expect(periodoQueContiene("2026-10-19", mensual)).toEqual({ desde: "2026-10-01", hasta: "2026-10-31" })
    expect(periodoQueContiene("2026-02-10", mensual)).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" })
    expect(periodoQueContiene("2028-02-29", mensual)).toEqual({ desde: "2028-02-01", hasta: "2028-02-29" })
  })

  it.each([
    ["2026-02-16", "2026-02-28"],
    ["2028-02-20", "2028-02-29"], // bisiesto
    ["2026-04-30", "2026-04-30"],
    ["2026-10-31", "2026-10-31"],
  ])("quincenal: la segunda quincena de %s termina el %s", (fecha, hasta) => {
    expect(periodoQueContiene(fecha, quincenal)).toEqual({ desde: `${fecha.slice(0, 8)}16`, hasta })
  })

  it("quincenal: del 1 al 15, con el 15 incluido", () => {
    expect(periodoQueContiene("2026-10-01", quincenal)).toEqual({ desde: "2026-10-01", hasta: "2026-10-15" })
    expect(periodoQueContiene("2026-10-15", quincenal)).toEqual({ desde: "2026-10-01", hasta: "2026-10-15" })
    expect(periodoQueContiene("2026-10-16", quincenal)).toEqual({ desde: "2026-10-16", hasta: "2026-10-31" })
  })

  it("semanal desde el lunes: el lunes 19 y el domingo 25 son de la misma semana", () => {
    expect(periodoQueContiene("2026-10-19", semanalLunes)).toEqual({ desde: "2026-10-19", hasta: "2026-10-25" })
    expect(periodoQueContiene("2026-10-25", semanalLunes)).toEqual({ desde: "2026-10-19", hasta: "2026-10-25" })
  })

  it("semanal desde el domingo: el domingo 25 empieza otra semana", () => {
    expect(periodoQueContiene("2026-10-24", semanalDomingo)).toEqual({ desde: "2026-10-18", hasta: "2026-10-24" })
    expect(periodoQueContiene("2026-10-25", semanalDomingo)).toEqual({ desde: "2026-10-25", hasta: "2026-10-31" })
  })

  it("semanal que cruza de año", () => {
    expect(periodoQueContiene("2027-01-01", semanalLunes)).toEqual({ desde: "2026-12-28", hasta: "2027-01-03" })
  })

  it("lanza con una fecha inválida", () => {
    expect(() => periodoQueContiene("2026-02-30", mensual)).toThrow(RangeError)
  })
})

describe("proximoPeriodo", () => {
  it("sigue al día siguiente de la última liquidación", () => {
    expect(proximoPeriodo({ ultimaHasta: "2026-09-30", primerPendiente: null, hoy: "2026-10-20", config: mensual })).toEqual({
      desde: "2026-10-01",
      hasta: "2026-10-31",
    })
  })

  it("la primera arranca en el período de lo más antiguo pendiente", () => {
    expect(
      proximoPeriodo({ ultimaHasta: null, primerPendiente: "2026-08-12", hoy: "2026-10-20", config: quincenal })
    ).toEqual({ desde: "2026-08-01", hasta: "2026-08-15" })
  })

  it("la primera, sin nada pendiente, es el período de hoy", () => {
    expect(proximoPeriodo({ ultimaHasta: null, primerPendiente: null, hoy: "2026-10-20", config: semanalLunes })).toEqual({
      desde: "2026-10-19",
      hasta: "2026-10-25",
    })
  })

  it("cambiar de mensual a semanal a mitad: el desde sale de lo cerrado y el hasta del período nuevo", () => {
    // Cerrado hasta el sábado 31 de octubre; la semana desde el lunes que lo contiene termina el domingo 1.
    expect(proximoPeriodo({ ultimaHasta: "2026-10-31", primerPendiente: null, hoy: "2026-11-03", config: semanalLunes })).toEqual({
      desde: "2026-11-01",
      hasta: "2026-11-01",
    })
    // Y la siguiente ya es una semana entera.
    expect(proximoPeriodo({ ultimaHasta: "2026-11-01", primerPendiente: null, hoy: "2026-11-03", config: semanalLunes })).toEqual({
      desde: "2026-11-02",
      hasta: "2026-11-08",
    })
  })

  it("cambiar de semanal a quincenal: termina en el 15 o en fin de mes", () => {
    expect(proximoPeriodo({ ultimaHasta: "2026-10-11", primerPendiente: null, hoy: "2026-10-20", config: quincenal })).toEqual({
      desde: "2026-10-12",
      hasta: "2026-10-15",
    })
  })

  it("febrero bisiesto de 2028, quincenal", () => {
    expect(proximoPeriodo({ ultimaHasta: "2028-02-15", primerPendiente: null, hoy: "2028-03-01", config: quincenal })).toEqual({
      desde: "2028-02-16",
      hasta: "2028-02-29",
    })
  })
})

describe("bordes en la zona del negocio", () => {
  it("fin del 4 de abril de 2026 en Santiago: el día dura 25 horas", () => {
    // 4 de abril 00:00 (UTC-3) = 03:00Z; el 5 a las 00:00 ya es UTC-4 = 04:00Z.
    expect(inicioDelPeriodoEn("2026-04-04", SANTIAGO).toISOString()).toBe("2026-04-04T03:00:00.000Z")
    expect(finDelPeriodoEn("2026-04-04", SANTIAGO).toISOString()).toBe("2026-04-05T04:00:00.000Z")
    // Las 23:30 de la segunda vuelta del reloj todavía son del sábado 4.
    expect(fechaDelNegocio(new Date("2026-04-05T03:30:00.000Z"), SANTIAGO)).toBe("2026-04-04")
    expect(fechaDelNegocio(new Date("2026-04-05T04:00:00.000Z"), SANTIAGO)).toBe("2026-04-05")
  })

  it("el 6 de septiembre de 2026 empieza a la 01:00 y la semana termina con el horario nuevo", () => {
    // Semana del lunes 31 de agosto al domingo 6: termina el lunes 7 a las 00:00 (UTC-3).
    const semana = periodoQueContiene("2026-09-06", semanalLunes)
    expect(semana).toEqual({ desde: "2026-08-31", hasta: "2026-09-06" })
    expect(finDelPeriodoEn(semana.hasta, SANTIAGO).toISOString()).toBe("2026-09-07T03:00:00.000Z")
    // El sábado 5 termina con el salto: 00:00 del domingo no existe, la 01:00 (UTC-3) = 04:00Z.
    expect(finDelPeriodoEn("2026-09-05", SANTIAGO).toISOString()).toBe("2026-09-06T04:00:00.000Z")
    expect(inicioDelPeriodoEn("2026-08-31", SANTIAGO).toISOString()).toBe("2026-08-31T04:00:00.000Z")
  })
})

describe("configuracionDelNegocio", () => {
  it("usa lo guardado si es válido", () => {
    expect(configuracionDelNegocio({ liquidacionPeriodo: "semanal", liquidacionInicioSemana: 0 })).toEqual(semanalDomingo)
  })

  it("lo que no conoce cae en mensual y lunes", () => {
    expect(configuracionDelNegocio({ liquidacionPeriodo: "diario", liquidacionInicioSemana: 9 })).toEqual(mensual)
    expect(configuracionDelNegocio({ liquidacionPeriodo: null, liquidacionInicioSemana: undefined })).toEqual(mensual)
  })
})

describe("columnas DATE y lectura", () => {
  it("ida y vuelta sin pasar por la zona del proceso", () => {
    expect(fechaParaColumna("2026-10-01").toISOString()).toBe("2026-10-01T00:00:00.000Z")
    expect(fechaDeColumna(fechaParaColumna("2028-02-29"))).toBe("2028-02-29")
    expect(() => fechaParaColumna("2026-13-01")).toThrow(RangeError)
  })

  it("períodos para leer", () => {
    expect(periodoParaLeer("2026-10-01", "2026-10-15")).toBe("1 al 15 oct 2026")
    expect(periodoParaLeer("2026-09-28", "2026-10-04")).toBe("28 sept al 4 oct 2026")
    expect(periodoParaLeer("2026-12-28", "2027-01-03")).toBe("28 dic 2026 al 3 ene 2027")
    expect(periodoParaLeer("2026-11-01", "2026-11-01")).toBe("1 nov 2026")
  })
})
