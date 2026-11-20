import { describe, it, expect } from "vitest"
import { instanteEn } from "@/lib/zona-horaria"
import { elementosDelDia, horasParaAgendarEn } from "./_lista-del-dia"

const h = (hora: number, minutos = 0) => hora * 60 + minutos
const ZONA = "America/Santiago"
const dosCifras = (n: number) => String(n).padStart(2, "0")
const local = (hora: number, minutos = 0, dia = 20) =>
  instanteEn(`2026-10-${dosCifras(dia)}`, `${dosCifras(hora)}:${dosCifras(minutos)}`, ZONA).toISOString()

// El 20 de octubre de 2026 es martes (2).
const dia20 = new Date(2026, 9, 20)
const horario = [{ dayOfWeek: 2, startTime: "09:00", endTime: "13:00" }, { dayOfWeek: 2, startTime: "14:00", endTime: "18:00" }]

const cita = (id: string, desde: [number, number], hasta: [number, number], status = "confirmada") => ({
  id,
  status,
  startTime: local(...desde),
  endTime: local(...hasta),
})

/** Sólo lo que importa para leer el resultado: el tipo, las horas y de quién. */
type Elementos = ReturnType<typeof elementosDelDia<{ id: string; startTime: string; endTime: string; status: string }, { startTime: string; endTime: string; memberId: string | null }>>
const resumen = (elementos: Elementos) =>
  elementos.map((elemento) => [
    elemento.tipo,
    elemento.inicioMin,
    elemento.finMin,
    elemento.tipo === "cita" ? elemento.cita.id : elemento.tipo === "bloqueo" ? "b" : "",
  ])

describe("elementosDelDia", () => {
  it("sin nada agendado: un hueco por franja de atención", () => {
    expect(resumen(elementosDelDia({ fecha: dia20, zona: ZONA, citas: [], bloqueos: [], horario }))).toEqual([
      ["libre", h(9), h(13), ""],
      ["libre", h(14), h(18), ""],
    ])
  })

  it("las citas parten los huecos y todo queda en orden", () => {
    const citas = [cita("b", [11, 30], [13, 0]), cita("a", [10, 0], [10, 30])]
    expect(resumen(elementosDelDia({ fecha: dia20, zona: ZONA, citas, bloqueos: [], horario }))).toEqual([
      ["libre", h(9), h(10), ""],
      ["cita", h(10), h(10, 30), "a"],
      ["libre", h(10, 30), h(11, 30), ""],
      ["cita", h(11, 30), h(13), "b"],
      ["libre", h(14), h(18), ""],
    ])
  })

  it("una cancelada se muestra pero deja libre su horario", () => {
    const citas = [cita("c", [9, 0], [10, 0], "cancelada")]
    expect(resumen(elementosDelDia({ fecha: dia20, zona: ZONA, citas, bloqueos: [], horario: [horario[0]] }))).toEqual([
      ["cita", h(9), h(10), "c"],
      ["libre", h(9), h(13), ""],
    ])
  })

  it("un bloqueo de todo el negocio tapa el hueco; el de un profesional no", () => {
    const bloqueos = [
      { id: "1", memberId: null, startTime: local(9), endTime: local(10) },
      { id: "2", memberId: "m1", startTime: local(11), endTime: local(12) },
    ]
    expect(resumen(elementosDelDia({ fecha: dia20, zona: ZONA, citas: [], bloqueos, horario: [horario[0]] }))).toEqual([
      ["bloqueo", h(9), h(10), "b"],
      ["libre", h(10), h(13), ""],
      ["bloqueo", h(11), h(12), "b"],
    ])
  })

  it("los huecos de menos de 15 minutos no se ofrecen", () => {
    const citas = [cita("a", [9, 10], [12, 50])]
    expect(resumen(elementosDelDia({ fecha: dia20, zona: ZONA, citas, bloqueos: [], horario: [horario[0]] }))).toEqual([
      ["cita", h(9, 10), h(12, 50), "a"],
    ])
  })

  it("desde la hora de ahora: lo que ya pasó no se ofrece y lo que corre se recorta", () => {
    expect(
      resumen(elementosDelDia({ fecha: dia20, zona: ZONA, citas: [], bloqueos: [], horario, desdeMin: h(15, 30) }))
    ).toEqual([["libre", h(15, 30), h(18), ""]])
  })

  it("otro día de la semana no usa este horario, y las citas de otro día no entran", () => {
    const citas = [cita("otro", [10, 0], [11, 0], "confirmada")].map((c) => ({ ...c, startTime: local(10, 0, 21), endTime: local(11, 0, 21) }))
    expect(elementosDelDia({ fecha: new Date(2026, 9, 21), zona: ZONA, citas: [], bloqueos: [], horario })).toEqual([])
    expect(elementosDelDia({ fecha: dia20, zona: ZONA, citas, bloqueos: [], horario: [] })).toEqual([])
  })
})

describe("horasParaAgendarEn", () => {
  it("una hora desde el comienzo del hueco, o lo que quede si es menos", () => {
    expect(horasParaAgendarEn({ inicioMin: h(10), finMin: h(13) })).toEqual({ inicioMin: h(10), finMin: h(11) })
    expect(horasParaAgendarEn({ inicioMin: h(10), finMin: h(10, 30) })).toEqual({ inicioMin: h(10), finMin: h(10, 30) })
  })
})
