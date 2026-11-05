import { describe, it, expect } from "vitest"
import { candidatosDelDia, candidatosQueCubren, haceElServicio, horarioSemanalPublicado, horasDeLaFranja } from "./agenda-publica"

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
  it("cada 30 minutos desde que abre, sin pasarse del cierre", () => {
    expect(horasDeLaFranja({ startTime: "09:00", endTime: "11:30" }, 60)).toEqual(["09:00", "09:30", "10:00", "10:30"])
    expect(horasDeLaFranja({ startTime: "09:00", endTime: "10:00" }, 30)).toEqual(["09:00", "09:30"])
  })

  it("QA#2: un servicio largo no salta de a su duración (Color de 90 min ofrece las 10:00, 12:00, 14:00…)", () => {
    const horas = horasDeLaFranja({ startTime: "09:00", endTime: "18:00" }, 90)
    expect(horas[0]).toBe("09:00")
    expect(horas).toContain("12:00")
    expect(horas).toContain("14:00")
    expect(horas).toContain("16:00")
    // La última que cabe entera antes del cierre: 16:30 + 90 = 18:00.
    expect(horas[horas.length - 1]).toBe("16:30")
    expect(horas).toHaveLength(16)
  })

  it("un servicio corto se ofrece cada su duración: uno de 15 min, cada 15", () => {
    expect(horasDeLaFranja({ startTime: "09:00", endTime: "10:00" }, 15)).toEqual(["09:00", "09:15", "09:30", "09:45"])
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

describe("horarioSemanalPublicado (QA#4)", () => {
  // El escenario del re-QA: el negocio atiende de lunes a viernes de 09:00 a
  // 18:00 y el sábado de 10:00 a 14:00; Carla, la única profesional, lunes,
  // martes y miércoles de 14:00 a 20:00 con horario propio.
  const VIERNES = 5
  const SABADO = 6
  const filas = [
    ...[1, 2, 3, 4, 5].map((dia) => fila(null, "09:00", "18:00", dia)),
    fila(null, "10:00", "14:00", SABADO),
    ...[1, 2, 3].map((dia) => fila("m-carla", "14:00", "20:00", dia)),
  ]

  it("con profesionales publica sólo su horario: ni las horas ni los días del negocio que la reserva no ofrece", () => {
    expect(horarioSemanalPublicado(filas, ["m-carla"])).toEqual(
      [1, 2, 3].map((dayOfWeek) => ({ dayOfWeek, startTime: "14:00", endTime: "20:00" }))
    )
  })

  it("lo publicado es lo que la reserva ofrece: los mismos días y franjas que `candidatosDelDia`", () => {
    const semana = horarioSemanalPublicado(filas, ["m-carla"])
    for (const dayOfWeek of [0, 1, 2, 3, 4, VIERNES, SABADO]) {
      // 2026-11-01 es domingo.
      const fecha = `2026-11-0${dayOfWeek + 1}`
      const ofrecidas = candidatosDelDia(filas, true, ["m-carla"], fecha).flatMap((candidato) => candidato.franjas)
      expect(semana.filter((franja) => franja.dayOfWeek === dayOfWeek).map(({ startTime, endTime }) => ({ startTime, endTime }))).toEqual(ofrecidas)
    }
  })

  it("un profesional sin horario propio atiende en el del negocio, y ése es el que se publica", () => {
    const semana = horarioSemanalPublicado(filas, ["m-pedro"])
    expect(semana.filter((franja) => franja.dayOfWeek === LUNES)).toEqual([{ dayOfWeek: LUNES, startTime: "09:00", endTime: "18:00" }])
    expect(semana.filter((franja) => franja.dayOfWeek === SABADO)).toEqual([{ dayOfWeek: SABADO, startTime: "10:00", endTime: "14:00" }])
  })

  it("con varios, la unión de sus horarios efectivos", () => {
    const semana = horarioSemanalPublicado(filas, ["m-carla", "m-pedro"])
    expect(semana.filter((franja) => franja.dayOfWeek === LUNES)).toEqual([{ dayOfWeek: LUNES, startTime: "09:00", endTime: "20:00" }])
    expect(semana.filter((franja) => franja.dayOfWeek === VIERNES)).toEqual([{ dayOfWeek: VIERNES, startTime: "09:00", endTime: "18:00" }])
  })

  it("sin profesionales (null), el del negocio", () => {
    const semana = horarioSemanalPublicado(filas, null)
    expect(semana.filter((franja) => franja.dayOfWeek === LUNES)).toEqual([{ dayOfWeek: LUNES, startTime: "09:00", endTime: "18:00" }])
    expect(semana.map((franja) => franja.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it("con profesionales pero ninguno que pueda tomar reservas, no publica horas: la reserva no ofrece ninguna", () => {
    expect(horarioSemanalPublicado(filas, [])).toEqual([])
  })

  it("el horario propio de quien no atiende (el encargado) no se publica", () => {
    const conEncargado = [...filas, fila("m-encargado", "06:00", "23:00")]
    expect(horarioSemanalPublicado(conEncargado, ["m-carla"]).filter((franja) => franja.dayOfWeek === LUNES)).toEqual([
      { dayOfWeek: LUNES, startTime: "14:00", endTime: "20:00" },
    ])
  })

  it("un profesional con franjas separadas no se fusiona, y suma un día que el negocio no tiene", () => {
    const semana = horarioSemanalPublicado(
      [fila(null, "09:00", "12:00"), fila("m-pedro", "15:00", "17:00"), fila("m-pedro", "10:00", "13:00", 0), fila("m-pedro", "09:00", "11:00")],
      ["m-pedro"]
    )
    expect(semana).toEqual([
      { dayOfWeek: 0, startTime: "10:00", endTime: "13:00" },
      { dayOfWeek: LUNES, startTime: "09:00", endTime: "11:00" },
      { dayOfWeek: LUNES, startTime: "15:00", endTime: "17:00" },
    ])
  })
})
