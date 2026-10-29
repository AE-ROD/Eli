import { describe, it, expect } from "vitest"
import {
  HORA_VALLE_APAGADA,
  configuracionDeHoraValleSchema,
  porcentajeDeHoraValle,
  precioAlReagendar,
  preciosConHoraValle,
  rebajar,
  type ConfiguracionDeHoraValle,
} from "@/lib/hora-valle"

const SANTIAGO = "America/Santiago"
const LUNES = 1

/** Lunes de 10:00 a 12:00 con 20%; lunes de 11:00 a 13:00 con 30% (se pisan a propósito: manda el mayor). */
const CONFIG: ConfiguracionDeHoraValle = {
  activa: true,
  franjas: [
    { dayOfWeek: LUNES, desde: "10:00", hasta: "12:00", porcentaje: 20 },
    { dayOfWeek: LUNES, desde: "11:00", hasta: "13:00", porcentaje: 30 },
  ],
}

describe("porcentajeDeHoraValle", () => {
  it("apagada, o encendida sin franjas: 0", () => {
    const inicio = new Date("2030-01-07T13:00:00Z") // lunes 10:00 en Santiago (UTC-3)
    expect(porcentajeDeHoraValle(inicio, SANTIAGO, HORA_VALLE_APAGADA)).toBe(0)
    expect(porcentajeDeHoraValle(inicio, SANTIAGO, { ...CONFIG, activa: false })).toBe(0)
    expect(porcentajeDeHoraValle(inicio, SANTIAGO, { activa: true, franjas: [] })).toBe(0)
  })

  it("la hora de inicio en el reloj del negocio: [desde, hasta)", () => {
    expect(porcentajeDeHoraValle(new Date("2030-01-07T12:59:00Z"), SANTIAGO, CONFIG)).toBe(0) // 09:59
    expect(porcentajeDeHoraValle(new Date("2030-01-07T13:00:00Z"), SANTIAGO, CONFIG)).toBe(20) // 10:00
    expect(porcentajeDeHoraValle(new Date("2030-01-07T15:59:00Z"), SANTIAGO, CONFIG)).toBe(30) // 12:59
    expect(porcentajeDeHoraValle(new Date("2030-01-07T16:00:00Z"), SANTIAGO, CONFIG)).toBe(0) // 13:00, excluida
  })

  it("varias franjas: el mayor %", () => {
    expect(porcentajeDeHoraValle(new Date("2030-01-07T14:30:00Z"), SANTIAGO, CONFIG)).toBe(30) // 11:30
  })

  it("en invierno (UTC-4) la misma hora de pared es otro instante", () => {
    // Lunes 1 de julio de 2030, 10:00 en Santiago = 14:00 UTC.
    expect(porcentajeDeHoraValle(new Date("2030-07-01T14:00:00Z"), SANTIAGO, CONFIG)).toBe(20)
    // 13:00 UTC es 09:00 allá: fuera.
    expect(porcentajeDeHoraValle(new Date("2030-07-01T13:00:00Z"), SANTIAGO, CONFIG)).toBe(0)
  })

  it("el día de la semana es el del negocio, no el de UTC", () => {
    // Lunes 7 a las 23:30 en Santiago es martes 8 a las 02:30 UTC.
    const noche: ConfiguracionDeHoraValle = { activa: true, franjas: [{ dayOfWeek: LUNES, desde: "23:00", hasta: "23:59", porcentaje: 10 }] }
    expect(porcentajeDeHoraValle(new Date("2030-01-08T02:30:00Z"), SANTIAGO, noche)).toBe(10)
  })

  it("cambio de horario: el salto del 6/9/2026 y la hora repetida del 4/4/2026", () => {
    const config: ConfiguracionDeHoraValle = {
      activa: true,
      franjas: [
        { dayOfWeek: 6, desde: "23:00", hasta: "23:59", porcentaje: 15 }, // sábado
        { dayOfWeek: 0, desde: "01:00", hasta: "02:00", porcentaje: 25 }, // domingo
      ],
    }
    // 03:30 UTC del domingo 6 es todavía el sábado 5 a las 23:30 (UTC-4).
    expect(porcentajeDeHoraValle(new Date("2026-09-06T03:30:00Z"), SANTIAGO, config)).toBe(15)
    // 04:30 UTC ya es el domingo 6 a la 01:30 (UTC-3, después del salto).
    expect(porcentajeDeHoraValle(new Date("2026-09-06T04:30:00Z"), SANTIAGO, config)).toBe(25)
    // El sábado 4/4/2026 las 23:30 ocurren dos veces: las dos son sábado en franja.
    expect(porcentajeDeHoraValle(new Date("2026-04-05T02:30:00Z"), SANTIAGO, config)).toBe(15)
    expect(porcentajeDeHoraValle(new Date("2026-04-05T03:30:00Z"), SANTIAGO, config)).toBe(15)
  })
})

describe("preciosConHoraValle", () => {
  const LUNES_10 = new Date("2030-01-07T13:00:00Z")
  const LUNES_9 = new Date("2030-01-07T12:00:00Z")

  it("apagada: los precios tal cual", () => {
    const r = preciosConHoraValle([{ price: 8000 }, { price: null }], LUNES_10, SANTIAGO, HORA_VALLE_APAGADA)
    expect(r).toEqual({ porcentaje: 0, precios: [8000, null], total: 8000, totalNormal: 8000, hayRebaja: false })
  })

  it("en franja: cada servicio rebajado; excluidos y sin precio no", () => {
    const r = preciosConHoraValle(
      [{ price: 8000 }, { price: 25000, excluidoDeHoraValle: true }, { price: null }, { price: 5000 }],
      LUNES_10,
      SANTIAGO,
      CONFIG
    )
    expect(r).toEqual({ porcentaje: 20, precios: [6400, 25000, null, 4000], total: 35400, totalNormal: 38000, hayRebaja: true })
  })

  it("fuera de franja: sin rebaja", () => {
    expect(preciosConHoraValle([{ price: 8000 }], LUNES_9, SANTIAGO, CONFIG).hayRebaja).toBe(false)
  })

  it("todos excluidos o sin precio: no hay rebaja aunque la hora sea valle", () => {
    const r = preciosConHoraValle([{ price: 8000, excluidoDeHoraValle: true }, { price: null }], LUNES_10, SANTIAGO, CONFIG)
    expect(r).toMatchObject({ porcentaje: 20, total: 8000, hayRebaja: false })
    expect(preciosConHoraValle([{ price: null }], LUNES_10, SANTIAGO, CONFIG).total).toBeNull()
  })

  it("redondeo a peso entero, por servicio, y el total es la suma de lo redondeado", () => {
    expect(rebajar(8333, 30)).toBe(5833) // 5833,1
    expect(rebajar(8335, 30)).toBe(5835) // 5834,5 → hacia arriba
    const treinta: ConfiguracionDeHoraValle = {
      activa: true,
      franjas: [{ dayOfWeek: LUNES, desde: "10:00", hasta: "11:00", porcentaje: 30 }],
    }
    const r = preciosConHoraValle([{ price: 8335 }, { price: 8333 }], LUNES_10, SANTIAGO, treinta)
    expect(r.precios).toEqual([5835, 5833])
    expect(r.total).toBe(5835 + 5833)
  })
})

describe("precioAlReagendar", () => {
  const LUNES_9 = new Date("2030-01-07T12:00:00Z")
  const LUNES_10 = new Date("2030-01-07T13:00:00Z")
  const LUNES_1030 = new Date("2030-01-07T13:30:00Z")

  it("apagada o mismo %: no cambia (null)", () => {
    expect(precioAlReagendar([{ price: 8000 }], LUNES_9, LUNES_10, SANTIAGO, HORA_VALLE_APAGADA)).toBeNull()
    expect(precioAlReagendar([{ price: 8000 }], LUNES_10, LUNES_1030, SANTIAGO, CONFIG)).toBeNull()
  })

  it("de normal a valle baja; de valle a normal vuelve al precio del catálogo", () => {
    expect(precioAlReagendar([{ price: 8000 }], LUNES_9, LUNES_10, SANTIAGO, CONFIG)).toMatchObject({ total: 6400, precios: [6400] })
    expect(precioAlReagendar([{ price: 8000 }], LUNES_10, LUNES_9, SANTIAGO, CONFIG)).toMatchObject({ total: 8000, hayRebaja: false })
  })
})

describe("configuracionDeHoraValleSchema", () => {
  const franja = { dayOfWeek: 1, desde: "10:00", hasta: "12:00", porcentaje: 20 }
  const valida = (franjas: unknown[], activa = true) => configuracionDeHoraValleSchema.safeParse({ activa, franjas }).success

  it("acepta lo de los CHECKs", () => {
    expect(valida([franja])).toBe(true)
    expect(valida([], false)).toBe(true)
    expect(valida([{ ...franja, porcentaje: 5 }, { ...franja, dayOfWeek: 2, porcentaje: 90 }])).toBe(true)
    // Una termina justo donde empieza la otra: no se pisan.
    expect(valida([franja, { ...franja, desde: "12:00", hasta: "13:00" }])).toBe(true)
  })

  it.each([
    [{ ...franja, dayOfWeek: 7 }],
    [{ ...franja, dayOfWeek: -1 }],
    [{ ...franja, dayOfWeek: 1.5 }],
    [{ ...franja, desde: "24:00" }],
    [{ ...franja, desde: "9:00" }],
    [{ ...franja, hasta: "10:00" }],
    [{ ...franja, desde: "12:00", hasta: "10:00" }],
    [{ ...franja, porcentaje: 4 }],
    [{ ...franja, porcentaje: 91 }],
    [{ ...franja, porcentaje: 10.5 }],
  ])("rechaza %j", (mala) => {
    expect(valida([mala])).toBe(false)
  })

  it("rechaza solapes del mismo día, no de días distintos", () => {
    expect(valida([franja, { ...franja, desde: "11:00", hasta: "13:00" }])).toBe(false)
    expect(valida([franja, { ...franja, dayOfWeek: 2 }])).toBe(true)
  })

  it("hasta 21 franjas", () => {
    const muchas = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ dayOfWeek: i % 7, desde: `${String(8 + Math.floor(i / 7)).padStart(2, "0")}:00`, hasta: `${String(8 + Math.floor(i / 7)).padStart(2, "0")}:30`, porcentaje: 10 }))
    expect(valida(muchas(21))).toBe(true)
    expect(valida(muchas(22))).toBe(false)
  })
})
