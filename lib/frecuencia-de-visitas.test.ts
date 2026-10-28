import { describe, it, expect } from "vitest"
import {
  FACTOR_SE_VA,
  MINIMO_DE_VISITAS_PARA_MEDIANA,
  cicloDelCliente,
  diasSinVenir,
  estaVencido,
  fechaDeVisita,
  frecuenciasPorCliente,
  medianaDeDias,
  seEstaYendo,
} from "./frecuencia-de-visitas"

const ZONA = "America/Santiago"

describe("las decisiones del dueño", () => {
  it("mediana con al menos 3 visitas y factor 1,5 fijo", () => {
    expect(MINIMO_DE_VISITAS_PARA_MEDIANA).toBe(3)
    expect(FACTOR_SE_VA).toBe(1.5)
  })
})

describe("medianaDeDias", () => {
  it("con menos de 3 visitas no hay ciclo propio", () => {
    expect(medianaDeDias([])).toBeNull()
    expect(medianaDeDias(["2026-01-01"])).toBeNull()
    expect(medianaDeDias(["2026-01-01", "2026-02-01"])).toBeNull()
  })

  it("con 3 visitas, la mediana de los 2 intervalos (promedio redondeado)", () => {
    // 21 y 30 días → 25,5 → 26
    expect(medianaDeDias(["2026-01-01", "2026-01-22", "2026-02-21"])).toBe(26)
  })

  it("con un número impar de intervalos, el del medio; un intervalo raro no la mueve", () => {
    // 20, 21, 90 → 21
    expect(medianaDeDias(["2026-01-01", "2026-01-21", "2026-02-11", "2026-05-12"])).toBe(21)
  })

  it("no depende del orden en que llegan las fechas", () => {
    expect(medianaDeDias(["2026-02-21", "2026-01-01", "2026-01-22"])).toBe(26)
  })

  it("dos visitas el mismo día cuentan como una", () => {
    expect(medianaDeDias(["2026-01-01", "2026-01-01", "2026-01-22"])).toBeNull()
    expect(medianaDeDias(["2026-01-01", "2026-01-01", "2026-01-22", "2026-02-12"])).toBe(21)
  })

  it("cuenta días calendario, también a través del cambio de horario (Santiago, 6/9/2026)", () => {
    expect(medianaDeDias(["2026-08-16", "2026-09-06", "2026-09-27"])).toBe(21)
  })
})

describe("fechaDeVisita: el día es el del negocio, no el de UTC", () => {
  it("una llegada a las 22:30 de Santiago es de ese día aunque en UTC ya sea el siguiente", () => {
    expect(fechaDeVisita(new Date("2026-10-29T01:30:00.000Z"), ZONA)).toBe("2026-10-28")
  })
})

describe("cicloDelCliente", () => {
  const tres = ["2026-01-01", "2026-01-22", "2026-02-12"]

  it("el propio gana sobre el del servicio", () => {
    expect(cicloDelCliente(tres, [60])).toEqual({ dias: 21, origen: "propio" })
  })

  it("sin ciclo propio, la frecuencia del servicio de la última visita", () => {
    expect(cicloDelCliente(["2026-01-01"], [30])).toEqual({ dias: 30, origen: "servicio" })
  })

  it("con varios servicios en la última visita, la frecuencia más corta; los sin frecuencia no cuentan", () => {
    expect(cicloDelCliente(["2026-01-01"], [null, 45, 28, undefined])).toEqual({ dias: 28, origen: "servicio" })
  })

  it("sin ninguno de los dos, sin ciclo", () => {
    expect(cicloDelCliente(["2026-01-01", "2026-02-01"], [null])).toBeNull()
    expect(cicloDelCliente([])).toBeNull()
  })
})

describe("vencido y se va", () => {
  it("vencido es hoy ≥ última visita + ciclo", () => {
    expect(estaVencido("2026-10-01", 28, "2026-10-28")).toBe(false)
    expect(estaVencido("2026-10-01", 28, "2026-10-29")).toBe(true)
    expect(estaVencido("2026-10-01", 28, "2026-11-15")).toBe(true)
  })

  it("se va es una ausencia ≥ 1,5 ciclos", () => {
    // 1,5 × 20 = 30
    expect(seEstaYendo("2026-10-01", 20, "2026-10-30")).toBe(false)
    expect(seEstaYendo("2026-10-01", 20, "2026-10-31")).toBe(true)
    // 1,5 × 21 = 31,5 → hacen falta 32
    expect(seEstaYendo("2026-10-01", 21, "2026-11-01")).toBe(false)
    expect(seEstaYendo("2026-10-01", 21, "2026-11-02")).toBe(true)
  })

  it("días sin venir en días calendario", () => {
    expect(diasSinVenir("2026-10-01", "2026-10-28")).toBe(27)
  })
})

describe("frecuenciasPorCliente", () => {
  const visita = (customerId: string, iso: string, servicios: { serviceId: string | null; nombre: string }[] = []) => ({
    customerId,
    arrivedAt: new Date(iso),
    servicios,
  })

  it("agrupa por cliente, toma la última visita y su servicio, y calcula el ciclo en la zona del negocio", () => {
    const resultado = frecuenciasPorCliente(
      [
        visita("c1", "2026-09-01T15:00:00.000Z", [{ serviceId: "s-color", nombre: "Color" }]),
        visita("c1", "2026-09-22T15:00:00.000Z"),
        // 22:30 del 13/10 en Santiago: 01:30 UTC del 14
        visita("c1", "2026-10-14T01:30:00.000Z", [{ serviceId: "s-corte", nombre: "Corte" }]),
        visita("c2", "2026-10-01T15:00:00.000Z", [{ serviceId: "s-corte", nombre: "Corte" }]),
        visita("c3", "2026-10-01T15:00:00.000Z", [{ serviceId: "s-color", nombre: "Color" }]),
      ],
      ZONA,
      new Map([
        ["s-corte", 30],
        ["s-color", null],
      ])
    )

    expect(resultado.get("c1")).toEqual({
      customerId: "c1",
      ultimaVisita: "2026-10-13",
      ultimoServicio: "Corte",
      ciclo: { dias: 21, origen: "propio" },
    })
    expect(resultado.get("c2")?.ciclo).toEqual({ dias: 30, origen: "servicio" })
    expect(resultado.get("c3")?.ciclo).toBeNull()
  })

  it("un servicio que no está en el mapa (de otro negocio) no aporta frecuencia", () => {
    const resultado = frecuenciasPorCliente(
      [visita("c1", "2026-10-01T15:00:00.000Z", [{ serviceId: "s-ajeno", nombre: "Corte" }])],
      ZONA,
      new Map()
    )
    expect(resultado.get("c1")?.ciclo).toBeNull()
  })
})
