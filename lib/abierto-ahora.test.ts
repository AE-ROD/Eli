import { describe, it, expect } from "vitest"
import { estadoDeAtencion, textoDeEstado } from "./abierto-ahora"
import type { FranjaDelDia } from "./horario-de-atencion"

const SANTIAGO = "America/Santiago"

// El 28 de octubre de 2026 es miércoles (3). Santiago está en UTC-3 ese mes.
const miercolesALas = (hora: string) => new Date(`2026-10-28T${hora}:00-03:00`)

const franja = (dayOfWeek: number, startTime: string, endTime: string): FranjaDelDia => ({ dayOfWeek, startTime, endTime })

/** Lunes a viernes de 10 a 14 y de 15 a 20. */
const SEMANA_PARTIDA = [1, 2, 3, 4, 5].flatMap((dia) => [franja(dia, "10:00", "14:00"), franja(dia, "15:00", "20:00")])

const texto = (franjas: FranjaDelDia[], ahora: Date, zona = SANTIAGO) => {
  const estado = estadoDeAtencion(franjas, ahora, zona)
  return estado && textoDeEstado(estado)
}

describe("estadoDeAtencion", () => {
  it("abierto dentro de una franja: dice a qué hora cierra esa franja", () => {
    expect(texto(SEMANA_PARTIDA, miercolesALas("11:30"))).toBe("Abierto ahora · cierra a las 14:00")
    expect(texto(SEMANA_PARTIDA, miercolesALas("19:59"))).toBe("Abierto ahora · cierra a las 20:00")
  })

  it("la hora de apertura ya es abierto y la de cierre ya es cerrado", () => {
    expect(texto(SEMANA_PARTIDA, miercolesALas("10:00"))).toBe("Abierto ahora · cierra a las 14:00")
    expect(texto(SEMANA_PARTIDA, miercolesALas("20:00"))).toBe("Cerrado · abre mañana a las 10:00")
  })

  it("en la pausa del mediodía abre hoy más tarde", () => {
    expect(texto(SEMANA_PARTIDA, miercolesALas("14:30"))).toBe("Cerrado · abre hoy a las 15:00")
  })

  it("antes de abrir, abre hoy", () => {
    expect(texto(SEMANA_PARTIDA, miercolesALas("08:00"))).toBe("Cerrado · abre hoy a las 10:00")
  })

  it("salta los días sin horario: el viernes en la noche abre el lunes", () => {
    const viernesNoche = new Date("2026-10-30T21:00:00-03:00")
    expect(texto(SEMANA_PARTIDA, viernesNoche)).toBe("Cerrado · abre el lunes a las 10:00")
  })

  it("con un solo día de atención, una semana después abre el mismo día", () => {
    const soloMiercoles = [franja(3, "10:00", "12:00")]
    expect(texto(soloMiercoles, miercolesALas("13:00"))).toBe("Cerrado · abre el miércoles a las 10:00")
  })

  it("sin horario no hay estado", () => {
    expect(estadoDeAtencion([], miercolesALas("11:00"), SANTIAGO)).toBeNull()
  })

  it("con filas que no se pueden medir, cerrado sin decir cuándo abre", () => {
    expect(texto([franja(3, "18:00", "10:00")], miercolesALas("11:00"))).toBe("Cerrado")
  })

  it("se calcula en la zona del negocio, no en la del servidor", () => {
    // 13:00 UTC: 10:00 en Santiago (abierto), 08:00 en Ciudad de México (cerrado).
    const instante = new Date("2026-10-28T13:00:00Z")
    expect(texto(SEMANA_PARTIDA, instante, SANTIAGO)).toBe("Abierto ahora · cierra a las 14:00")
    expect(texto(SEMANA_PARTIDA, instante, "America/Mexico_City")).toBe("Cerrado · abre hoy a las 10:00")
  })

  it("cruce de medianoche: hasta las 23:59 y desde las 00:00 del día siguiente es una sola franja", () => {
    const deNoche = [franja(3, "20:00", "23:59"), franja(4, "00:00", "02:00")]
    expect(texto(deNoche, miercolesALas("23:30"))).toBe("Abierto ahora · cierra a las 02:00")
    expect(texto(deNoche, miercolesALas("23:59"))).toBe("Abierto ahora · cierra a las 02:00")
    expect(texto(deNoche, new Date("2026-10-29T01:00:00-03:00"))).toBe("Abierto ahora · cierra a las 02:00")
  })

  it("hasta las 23:59 sin continuación cierra a las 23:59", () => {
    expect(texto([franja(3, "20:00", "23:59")], miercolesALas("22:00"))).toBe("Abierto ahora · cierra a las 23:59")
  })

  it("abierto todo el día todos los días no se queda dando vueltas", () => {
    const siempre = [0, 1, 2, 3, 4, 5, 6].map((dia) => franja(dia, "00:00", "23:59"))
    expect(texto(siempre, miercolesALas("12:00"))).toBe("Abierto ahora · cierra a las 23:59")
  })
})
