import { describe, it, expect } from "vitest"
import { candidatosDelDia, candidatosQueCubren, haceElServicio, horasDeLaFranja } from "./agenda-publica"

/** Las reglas puras. Lo que lee la base se prueba en `app/api/reservar/[slug]/por-profesional.test.ts`. */

const LUNES = 1
const fila = (memberId: string | null, startTime: string, endTime: string, dayOfWeek = LUNES) => ({
  memberId,
  dayOfWeek,
  startTime,
  endTime,
})

describe("haceElServicio", () => {
  it("sin servicios definidos, hace todos", () => {
    expect(haceElServicio({ serviceIds: [] }, "s-corte")).toBe(true)
  })
  it("con servicios definidos, sólo esos", () => {
    expect(haceElServicio({ serviceIds: ["s-color"] }, "s-color")).toBe(true)
    expect(haceElServicio({ serviceIds: ["s-color"] }, "s-corte")).toBe(false)
  })
})

describe("horasDeLaFranja", () => {
  it("cada `duracion` minutos desde que abre, sin pasarse del cierre", () => {
    expect(horasDeLaFranja({ startTime: "09:00", endTime: "11:30" }, 60)).toEqual(["09:00", "10:00"])
    expect(horasDeLaFranja({ startTime: "09:00", endTime: "10:00" }, 30)).toEqual(["09:00", "09:30"])
  })
  it("una duración inválida no da horas", () => {
    expect(horasDeLaFranja({ startTime: "09:00", endTime: "10:00" }, 0)).toEqual([])
  })
})

describe("candidatosDelDia", () => {
  // 2030-01-07 es lunes.
  const FECHA = "2030-01-07"

  it("sin profesionales: un solo carril con el horario del negocio", () => {
    expect(candidatosDelDia([fila(null, "09:00", "12:00"), fila(null, "15:00", "18:00", 2)], false, [], FECHA)).toEqual([
      { memberId: null, franjas: [{ startTime: "09:00", endTime: "12:00" }] },
    ])
  })

  it("con profesionales: cada uno con el suyo, o el del negocio si no cargó", () => {
    const filas = [fila(null, "09:00", "12:00"), fila("m-carla", "15:00", "17:00", 3)]
    expect(candidatosDelDia(filas, true, ["m-carla", "m-pedro"], FECHA)).toEqual([
      // Carla cargó horario (otro día): el lunes no atiende.
      { memberId: "m-carla", franjas: [] },
      { memberId: "m-pedro", franjas: [{ startTime: "09:00", endTime: "12:00" }] },
    ])
  })

  it("con profesionales pero ninguno hace el servicio: nadie (no se cae al carril del negocio)", () => {
    expect(candidatosDelDia([fila(null, "09:00", "12:00")], true, [], FECHA)).toEqual([])
  })
})

describe("candidatosQueCubren", () => {
  it("sólo los que tienen la hora entera en su horario", () => {
    const candidatos = [
      { memberId: "m-carla", franjas: [{ startTime: "09:00", endTime: "10:30" }] },
      { memberId: "m-pedro", franjas: [{ startTime: "09:00", endTime: "12:00" }] },
    ]
    expect(candidatosQueCubren(candidatos, "10:00", 60).map((c) => c.memberId)).toEqual(["m-pedro"])
    expect(candidatosQueCubren(candidatos, "09:00", 60).map((c) => c.memberId)).toEqual(["m-carla", "m-pedro"])
  })
})
