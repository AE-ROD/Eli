import { describe, it, expect } from "vitest"
import { cabeEnAtencion, franjasDeAtencion, horarioSemanalDeAtencion } from "./horario-de-atencion"

const general = (startTime: string, endTime: string) => ({ memberId: null, startTime, endTime })
const deMiembro = (memberId: string, startTime: string, endTime: string) => ({ memberId, startTime, endTime })

describe("franjasDeAtencion", () => {
  it("si el día tiene horario general, manda el general aunque los miembros tengan otras horas", () => {
    const franjas = franjasDeAtencion([
      deMiembro("m-carla", "14:00", "20:00"),
      general("09:00", "13:00"),
      deMiembro("m-pedro", "07:00", "10:00"),
    ])

    expect(franjas).toEqual([{ startTime: "09:00", endTime: "13:00" }])
  })

  it("sin horario general ese día, vale la unión de las franjas de los miembros, ordenada", () => {
    const franjas = franjasDeAtencion([deMiembro("m-pedro", "15:00", "19:00"), deMiembro("m-carla", "09:00", "12:00")])

    expect(franjas).toEqual([
      { startTime: "09:00", endTime: "12:00" },
      { startTime: "15:00", endTime: "19:00" },
    ])
  })

  it("las franjas de miembros que se pisan o se tocan se fusionan en una", () => {
    const franjas = franjasDeAtencion([
      deMiembro("m-carla", "09:00", "12:00"),
      deMiembro("m-pedro", "11:00", "14:00"),
      deMiembro("m-encargado", "14:00", "16:00"),
      deMiembro("m-pedro", "17:00", "18:00"),
    ])

    expect(franjas).toEqual([
      { startTime: "09:00", endTime: "16:00" },
      { startTime: "17:00", endTime: "18:00" },
    ])
  })

  it("respeta varias franjas generales el mismo día, en orden de inicio", () => {
    const franjas = franjasDeAtencion([general("15:00", "19:00"), general("09:00", "13:00")])

    expect(franjas).toEqual([
      { startTime: "09:00", endTime: "13:00" },
      { startTime: "15:00", endTime: "19:00" },
    ])
  })

  it("un día sin filas no tiene atención", () => {
    expect(franjasDeAtencion([])).toEqual([])
  })

  it("descarta las franjas que no se pueden medir; si la general es la única y es inválida, cae a los miembros", () => {
    expect(franjasDeAtencion([general("18:00", "09:00"), deMiembro("m-carla", "10:00", "12:00")])).toEqual([
      { startTime: "10:00", endTime: "12:00" },
    ])
  })
})

describe("horarioSemanalDeAtencion", () => {
  it("aplica la regla día por día y no expone el memberId", () => {
    const semana = horarioSemanalDeAtencion([
      // Lunes: hay general, los miembros no cuentan.
      { dayOfWeek: 1, ...general("09:00", "13:00") },
      { dayOfWeek: 1, ...deMiembro("m-carla", "14:00", "20:00") },
      // Martes: sólo miembros.
      { dayOfWeek: 2, ...deMiembro("m-carla", "10:00", "12:00") },
      { dayOfWeek: 2, ...deMiembro("m-pedro", "11:00", "13:00") },
    ])

    expect(semana).toEqual([
      { dayOfWeek: 1, startTime: "09:00", endTime: "13:00" },
      { dayOfWeek: 2, startTime: "10:00", endTime: "13:00" },
    ])
  })

  it("sin filas, ningún día habilitado", () => {
    expect(horarioSemanalDeAtencion([])).toEqual([])
  })
})

describe("cabeEnAtencion", () => {
  const franjas = [
    { startTime: "09:00", endTime: "13:00" },
    { startTime: "15:00", endTime: "19:00" },
  ]
  const min = (h: number, m = 0) => h * 60 + m

  it.each([
    ["justo al inicio de una franja", min(9), min(10), true],
    ["terminando justo al cierre", min(12), min(13), true],
    ["en la segunda franja", min(15, 30), min(16, 30), true],
    ["pasándose del cierre", min(12, 30), min(13, 30), false],
    ["empezando antes de abrir", min(8, 30), min(9, 30), false],
    ["cruzando el hueco entre franjas", min(12), min(16), false],
    ["fuera de toda franja", min(20), min(21), false],
  ])("%s", (_caso, inicio, fin, esperado) => {
    expect(cabeEnAtencion(franjas, inicio, fin)).toBe(esperado)
  })

  it("sin franjas, nada cabe", () => {
    expect(cabeEnAtencion([], min(10), min(11))).toBe(false)
  })
})
