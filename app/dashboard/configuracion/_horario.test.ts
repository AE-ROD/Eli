import { describe, expect, it } from "vitest"
import { HORARIO_INICIAL, horarioParaMostrar } from "./_horario"
import type { HorarioDelDia } from "./_datos"

const dia = (dayOfWeek: number, startTime = "10:00", endTime = "19:00", active = true): HorarioDelDia => ({
  id: `h-${dayOfWeek}`,
  dayOfWeek,
  startTime,
  endTime,
  active,
})

/** Lunes a sábado: el del negocio, con sábado. */
const DEL_NEGOCIO = [1, 2, 3, 4, 5, 6].map((n) => dia(n))

describe("horarioParaMostrar", () => {
  it("el general sin nada guardado muestra el ejemplo (con el aviso de que falta guardarlo)", () => {
    expect(horarioParaMostrar([], undefined)).toEqual({ semana: HORARIO_INICIAL, usaElDelNegocio: false })
  })

  it("alguien del equipo sin horario propio ve el del negocio, sábado incluido, y no el ejemplo", () => {
    const { semana, usaElDelNegocio } = horarioParaMostrar([], DEL_NEGOCIO)
    expect(usaElDelNegocio).toBe(true)
    expect(semana).toHaveLength(7)
    expect(semana.find((d) => d.dayOfWeek === 6)).toEqual({ dayOfWeek: 6, startTime: "10:00", endTime: "19:00", active: true })
    expect(semana.find((d) => d.dayOfWeek === 0)?.active).toBe(false)
    // Sin el `id` de las filas del negocio: guardarlo crea las suyas.
    expect(semana.every((d) => d.id === undefined)).toBe(true)
  })

  it("con el negocio también sin horario, no inventa días: todos no laborables", () => {
    const { semana, usaElDelNegocio } = horarioParaMostrar([], [])
    expect(usaElDelNegocio).toBe(true)
    expect(semana.some((d) => d.active)).toBe(false)
  })

  it("con horario propio, muestra el propio y completa los días que faltan como no laborables", () => {
    const { semana, usaElDelNegocio } = horarioParaMostrar([dia(2, "08:00", "12:00")], DEL_NEGOCIO)
    expect(usaElDelNegocio).toBe(false)
    expect(semana.filter((d) => d.active)).toEqual([{ dayOfWeek: 2, startTime: "08:00", endTime: "12:00", active: true }])
  })
})
