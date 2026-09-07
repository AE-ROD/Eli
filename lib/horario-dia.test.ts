import { describe, expect, it } from "vitest"
import {
  citasFueraDeFranjas,
  formatoDuracion,
  formatoHHMM,
  minutosLibresEnFranjas,
  segmentosDeFranja,
  type CitaDelDia,
} from "./horario-dia"

function cita(id: string, startHHMM: string, endHHMM: string): CitaDelDia {
  return {
    id,
    title: "Corte",
    startTime: `2026-09-07T${startHHMM}:00`,
    endTime: `2026-09-07T${endHHMM}:00`,
    status: "confirmada",
    patient: null,
  }
}

describe("segmentosDeFranja", () => {
  it("una franja sin citas es un unico hueco del largo completo", () => {
    const segmentos = segmentosDeFranja({ startTime: "09:00", endTime: "13:00" }, [])

    expect(segmentos).toEqual([{ tipo: "hueco", inicioMin: 540, finMin: 780 }])
  })

  it("intercala huecos entre citas y al final de la franja", () => {
    const segmentos = segmentosDeFranja({ startTime: "09:00", endTime: "13:00" }, [
      cita("a", "10:00", "11:00"),
    ])

    expect(segmentos).toEqual([
      { tipo: "hueco", inicioMin: 540, finMin: 600 },
      { tipo: "cita", inicioMin: 600, finMin: 660, cita: expect.objectContaining({ id: "a" }) },
      { tipo: "hueco", inicioMin: 660, finMin: 780 },
    ])
  })

  it("recorta una cita que empieza antes de la franja a los bordes de esta", () => {
    const segmentos = segmentosDeFranja({ startTime: "09:00", endTime: "13:00" }, [
      cita("a", "08:30", "09:30"),
    ])

    expect(segmentos[0]).toEqual(
      expect.objectContaining({ tipo: "cita", inicioMin: 540, finMin: 570 })
    )
  })

  it("una cita totalmente fuera de la franja no genera segmento", () => {
    const segmentos = segmentosDeFranja({ startTime: "09:00", endTime: "13:00" }, [
      cita("a", "14:00", "15:00"),
    ])

    expect(segmentos).toEqual([{ tipo: "hueco", inicioMin: 540, finMin: 780 }])
  })
})

describe("citasFueraDeFranjas", () => {
  it("detecta una cita que no cae en ninguna franja del dia", () => {
    const franjas = [
      { startTime: "09:00", endTime: "13:00" },
      { startTime: "14:00", endTime: "18:00" },
    ]
    const citas = [cita("a", "13:15", "13:45"), cita("b", "15:00", "16:00")]

    expect(citasFueraDeFranjas(franjas, citas)).toEqual([expect.objectContaining({ id: "a" })])
  })
})

describe("minutosLibresEnFranjas", () => {
  it("resta las horas ocupadas por citas de las horas del horario", () => {
    const libres = minutosLibresEnFranjas([{ startTime: "09:00", endTime: "13:00" }], [
      cita("a", "10:00", "11:00"),
    ])

    expect(libres).toBe(180)
  })

  it("sin citas, todo el horario cuenta como libre", () => {
    const libres = minutosLibresEnFranjas(
      [
        { startTime: "09:00", endTime: "13:00" },
        { startTime: "14:00", endTime: "18:00" },
      ],
      []
    )

    expect(libres).toBe(480)
  })

  it("con el dia completo reservado no queda tiempo libre", () => {
    const libres = minutosLibresEnFranjas([{ startTime: "09:00", endTime: "10:00" }], [
      cita("a", "09:00", "10:00"),
    ])

    expect(libres).toBe(0)
  })
})

describe("formatoDuracion", () => {
  it("muestra solo minutos cuando no llega a la hora", () => {
    expect(formatoDuracion(45)).toBe("45 min")
  })

  it("muestra solo horas cuando es exacto", () => {
    expect(formatoDuracion(120)).toBe("2 h")
  })

  it("combina horas y minutos", () => {
    expect(formatoDuracion(125)).toBe("2 h 5 min")
  })

  it("cero o negativo se lee como sin tiempo libre", () => {
    expect(formatoDuracion(0)).toBe("0 min")
    expect(formatoDuracion(-10)).toBe("0 min")
  })
})

describe("formatoHHMM", () => {
  it("formatea minutos desde medianoche como HH:MM", () => {
    expect(formatoHHMM(540)).toBe("09:00")
    expect(formatoHHMM(60)).toBe("01:00")
  })
})
