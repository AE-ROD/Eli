import { describe, it, expect } from "vitest"
import {
  FRANJAS_MAXIMAS_POR_DIA,
  MENSAJE_DE_DIA_REPETIDO,
  MENSAJE_DE_FRANJAS_PISADAS,
  filasDeLaGrilla,
  franjaGuardableEnUnaSede,
  franjasSePisan,
  grillaDeFilas,
  grillaDeSedeSchema,
} from "./grilla-de-sede"

const dia = (dayOfWeek: number, ...franjas: [string, string][]) => ({
  dayOfWeek,
  franjas: franjas.map(([start, end]) => ({ start, end })),
})

const primerError = (cuerpo: unknown) => {
  const r = grillaDeSedeSchema.safeParse(cuerpo)
  return r.success ? null : r.error.issues[0].message
}

describe("grillaDeSedeSchema", () => {
  it("acepta una semana con franjas, días sin franjas y la grilla vacía", () => {
    expect(grillaDeSedeSchema.parse({ dias: [dia(1, ["09:00", "13:00"], ["15:00", "19:00"]), dia(2)] })).toEqual({
      dias: [dia(1, ["09:00", "13:00"], ["15:00", "19:00"]), dia(2)],
    })
    expect(grillaDeSedeSchema.parse({ dias: [] })).toEqual({ dias: [] })
  })

  it("tocarse (una termina cuando la otra empieza) no es pisarse", () => {
    expect(grillaDeSedeSchema.safeParse({ dias: [dia(1, ["09:00", "12:00"], ["12:00", "15:00"])] }).success).toBe(true)
  })

  it("el extremo del día vale: 00:00 y 23:59", () => {
    expect(grillaDeSedeSchema.safeParse({ dias: [dia(0, ["00:00", "23:59"])] }).success).toBe(true)
  })

  it.each([
    ["una hora de una cifra", dia(1, ["9:00", "13:00"]), "Las horas van como HH:MM, de 00:00 a 23:59"],
    ["las 24:00 (el CHECK de la base no las acepta)", dia(1, ["09:00", "24:00"]), "Las horas van como HH:MM, de 00:00 a 23:59"],
    ["minutos de más", dia(1, ["09:60", "13:00"]), "Las horas van como HH:MM, de 00:00 a 23:59"],
    ["una hora con segundos", dia(1, ["09:00:00", "13:00"]), "Las horas van como HH:MM, de 00:00 a 23:59"],
    ["inicio igual al fin", dia(1, ["09:00", "09:00"]), "La hora de inicio debe ser anterior a la hora de fin"],
    ["inicio después del fin", dia(1, ["18:00", "09:00"]), "La hora de inicio debe ser anterior a la hora de fin"],
    ["franjas que se pisan", dia(1, ["09:00", "13:00"], ["12:59", "15:00"]), MENSAJE_DE_FRANJAS_PISADAS],
    ["una franja dentro de otra", dia(1, ["09:00", "18:00"], ["10:00", "11:00"]), MENSAJE_DE_FRANJAS_PISADAS],
    ["un día 7", dia(7, ["09:00", "13:00"]), "El día de la semana tiene que ser un número entero del 0 al 6"],
    ["un día 1.5", dia(1.5, ["09:00", "13:00"]), "El día de la semana tiene que ser un número entero del 0 al 6"],
    [
      "más franjas que el tope",
      dia(1, ["06:00", "07:00"], ["08:00", "09:00"], ["10:00", "11:00"], ["12:00", "13:00"], ["14:00", "15:00"]),
      `Un día no puede tener más de ${FRANJAS_MAXIMAS_POR_DIA} franjas`,
    ],
  ])("rechaza %s con un mensaje legible", (_caso, unDia, mensaje) => {
    expect(primerError({ dias: [unDia] })).toBe(mensaje)
  })

  it("rechaza un día repetido", () => {
    expect(primerError({ dias: [dia(1, ["09:00", "10:00"]), dia(1, ["11:00", "12:00"])] })).toBe(MENSAJE_DE_DIA_REPETIDO)
  })

  it("rechaza más de siete días", () => {
    expect(primerError({ dias: Array.from({ length: 8 }, (_, i) => dia(i % 7)) })).toBe("La semana tiene siete días")
  })

  it.each([[undefined], [null], [{}], [{ dias: "lunes" }], [{ dias: [{ franjas: [] }] }], [{ dias: [{ dayOfWeek: 1 }] }], [{ dias: [{ dayOfWeek: 1, franjas: [{ start: 9, end: 10 }] }] }]])(
    "rechaza una forma que no es una grilla: %j",
    (cuerpo) => {
      expect(grillaDeSedeSchema.safeParse(cuerpo).success).toBe(false)
    }
  )
})

describe("franjasSePisan", () => {
  it("separa pisarse de tocarse", () => {
    expect(franjasSePisan([{ start: "09:00", end: "12:00" }, { start: "12:00", end: "15:00" }])).toBe(false)
    expect(franjasSePisan([{ start: "09:00", end: "12:01" }, { start: "12:00", end: "15:00" }])).toBe(true)
    expect(franjasSePisan([])).toBe(false)
  })
})

describe("filasDeLaGrilla", () => {
  it("una fila activa por franja, del horario de la sede (sin integrante), y nada por los días vacíos", () => {
    const grilla = grillaDeSedeSchema.parse({ dias: [dia(1, ["09:00", "13:00"], ["15:00", "19:00"]), dia(2), dia(6, ["10:00", "14:00"])] })

    expect(filasDeLaGrilla(grilla, { businessId: "n1", sedeId: "s1" })).toEqual([
      { businessId: "n1", sedeId: "s1", memberId: null, dayOfWeek: 1, startTime: "09:00", endTime: "13:00", active: true },
      { businessId: "n1", sedeId: "s1", memberId: null, dayOfWeek: 1, startTime: "15:00", endTime: "19:00", active: true },
      { businessId: "n1", sedeId: "s1", memberId: null, dayOfWeek: 6, startTime: "10:00", endTime: "14:00", active: true },
    ])
    expect(filasDeLaGrilla({ dias: [] }, { businessId: "n1", sedeId: "s1" })).toEqual([])
  })
})

describe("grillaDeFilas", () => {
  it("agrupa por día de domingo a sábado, ordena las franjas y deja afuera las inactivas", () => {
    expect(
      grillaDeFilas([
        { dayOfWeek: 3, startTime: "15:00", endTime: "19:00" },
        { dayOfWeek: 0, startTime: "10:00", endTime: "12:00" },
        { dayOfWeek: 3, startTime: "09:00", endTime: "13:00" },
        { dayOfWeek: 5, startTime: "09:00", endTime: "13:00", active: false },
        { dayOfWeek: 5, startTime: "14:00", endTime: "16:00", active: true },
      ])
    ).toEqual([dia(0, ["10:00", "12:00"]), dia(3, ["09:00", "13:00"], ["15:00", "19:00"]), dia(5, ["14:00", "16:00"])])
  })

  it("no fusiona las que se tocan: se ve lo que se guardó", () => {
    expect(grillaDeFilas([{ dayOfWeek: 1, startTime: "09:00", endTime: "12:00" }, { dayOfWeek: 1, startTime: "12:00", endTime: "15:00" }])).toEqual([
      dia(1, ["09:00", "12:00"], ["12:00", "15:00"]),
    ])
  })

  it("sin filas, sin días", () => {
    expect(grillaDeFilas([])).toEqual([])
  })
})

describe("franjaGuardableEnUnaSede", () => {
  it("es la regla del CHECK de la base: HH:MM válido e inicio antes del fin", () => {
    expect(franjaGuardableEnUnaSede({ startTime: "09:00", endTime: "18:00" })).toBe(true)
    expect(franjaGuardableEnUnaSede({ startTime: "9:00", endTime: "18:00" })).toBe(false)
    expect(franjaGuardableEnUnaSede({ startTime: "09:00", endTime: "24:00" })).toBe(false)
    expect(franjaGuardableEnUnaSede({ startTime: "18:00", endTime: "09:00" })).toBe(false)
    expect(franjaGuardableEnUnaSede({ startTime: "09:00", endTime: "09:00" })).toBe(false)
  })
})
