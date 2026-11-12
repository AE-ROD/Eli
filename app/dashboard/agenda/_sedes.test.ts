import { describe, it, expect } from "vitest"
import {
  SIN_SEDES,
  franjasDeLaSedeEseDia,
  opcionesDeSede,
  sedeDelBorrador,
  sedeParaMostrar,
} from "./_sedes"

describe("sedeParaMostrar", () => {
  it("con varias sedes, el nombre de la sede de la hora", () => {
    expect(sedeParaMostrar({ sede: { nombre: "Providencia" } }, "varias")).toBe("Providencia")
  })

  it("con una sola sede o ninguna, la agenda no la nombra, aunque la hora la traiga", () => {
    expect(sedeParaMostrar({ sede: { nombre: "Providencia" } }, "una")).toBeNull()
  })

  it("una hora sin sede (de antes de tener sedes) no dice nada", () => {
    expect(sedeParaMostrar({ sede: null }, "varias")).toBeNull()
    expect(sedeParaMostrar({}, "varias")).toBeNull()
    expect(sedeParaMostrar({ sede: { nombre: "   " } }, "varias")).toBeNull()
  })

  it("recorta el nombre", () => {
    expect(sedeParaMostrar({ sede: { nombre: " Centro " } }, "varias")).toBe("Centro")
  })
})

describe("SIN_SEDES", () => {
  it("es la agenda de siempre: modo una y ninguna sede", () => {
    expect(SIN_SEDES).toEqual({ modo: "una", sedes: [] })
  })
})

describe("opcionesDeSede", () => {
  it("una opción por sede, en el orden recibido", () => {
    expect(
      opcionesDeSede([
        { id: "b", nombre: "Providencia" },
        { id: "a", nombre: "Centro" },
      ])
    ).toEqual([
      { valor: "b", texto: "Providencia" },
      { valor: "a", texto: "Centro" },
    ])
  })
})

describe("sedeDelBorrador", () => {
  it("con varias sedes, la sede vacía: todavía sin elegir", () => {
    expect(sedeDelBorrador("varias")).toEqual({ sedeId: "" })
  })

  it("con una sola sede o ninguna, ni la clave: la hora se crea como siempre", () => {
    expect(sedeDelBorrador("una")).toEqual({})
    expect(sedeDelBorrador("una")).not.toHaveProperty("sedeId")
  })
})

describe("franjasDeLaSedeEseDia", () => {
  const horario = [
    { dayOfWeek: 2, startTime: "14:00", endTime: "19:00" },
    { dayOfWeek: 2, startTime: "09:00", endTime: "13:00" },
    { dayOfWeek: 4, startTime: "10:00", endTime: "12:00" },
  ]

  it("las franjas del día de la semana de la fecha, de la más temprana a la más tarde", () => {
    // El 20 de octubre de 2026 es martes.
    expect(franjasDeLaSedeEseDia(horario, "2026-10-20")).toEqual([
      { startTime: "09:00", endTime: "13:00" },
      { startTime: "14:00", endTime: "19:00" },
    ])
  })

  it("un día en que no atiende, ninguna", () => {
    // El 21 de octubre de 2026 es miércoles.
    expect(franjasDeLaSedeEseDia(horario, "2026-10-21")).toEqual([])
  })

  it("una fecha que no es un día real, ninguna (sin lanzar)", () => {
    expect(franjasDeLaSedeEseDia(horario, "")).toEqual([])
    expect(franjasDeLaSedeEseDia(horario, "2026-02-31")).toEqual([])
    expect(franjasDeLaSedeEseDia(horario, "no es una fecha")).toEqual([])
  })

  it("no toca el horario que recibe", () => {
    const copia = JSON.parse(JSON.stringify(horario))
    franjasDeLaSedeEseDia(horario, "2026-10-20")
    expect(horario).toEqual(copia)
  })
})
