import { describe, it, expect } from "vitest"
import { citasPorHora, columnasDeSolape, rangoDeHoras, tramoDeCita, tramosDeFranjas } from "./_disposicion"

const h = (hora: number, minutos = 0) => hora * 60 + minutos

/** Un instante ISO a esa hora local del 20 de octubre de 2026, como llegan las citas. */
const local = (hora: number, minutos = 0, dia = 20) => new Date(2026, 9, dia, hora, minutos).toISOString()

describe("rangoDeHoras", () => {
  it("sin nada, de 8 a 20 como siempre", () => {
    expect(rangoDeHoras([])).toEqual({ desde: 8, hasta: 20 })
  })

  it("nunca achica: un horario de 10 a 14 sigue mostrando de 8 a 20", () => {
    expect(rangoDeHoras([{ inicioMin: h(10), finMin: h(14) }])).toEqual({ desde: 8, hasta: 20 })
  })

  it("se amplía con el horario de atención: de 7 a 21", () => {
    expect(rangoDeHoras([{ inicioMin: h(7), finMin: h(21) }])).toEqual({ desde: 7, hasta: 21 })
  })

  it("una cita a las 6:30 trae la hora de las 6; una que termina 20:15 trae la de las 20", () => {
    expect(
      rangoDeHoras([
        { inicioMin: h(6, 30), finMin: h(7) },
        { inicioMin: h(19, 45), finMin: h(20, 15) },
      ])
    ).toEqual({ desde: 6, hasta: 21 })
  })

  it("terminar en punto no pide la hora siguiente", () => {
    expect(rangoDeHoras([{ inicioMin: h(19), finMin: h(21) }])).toEqual({ desde: 8, hasta: 21 })
  })

  it("una cita a las 22:00 sin duración ocupa igual su hora", () => {
    expect(rangoDeHoras([{ inicioMin: h(22), finMin: h(22) }])).toEqual({ desde: 8, hasta: 23 })
  })

  it("no pasa de la medianoche", () => {
    expect(rangoDeHoras([{ inicioMin: h(23, 30), finMin: h(26) }])).toEqual({ desde: 8, hasta: 24 })
  })

  it("de madrugada, desde las 0", () => {
    expect(rangoDeHoras([{ inicioMin: 0, finMin: h(1) }])).toEqual({ desde: 0, hasta: 20 })
  })
})

describe("tramosDeFranjas", () => {
  it("pasa las franjas a minutos y descarta las que no se pueden medir", () => {
    expect(
      tramosDeFranjas([
        { startTime: "09:00", endTime: "13:00" },
        { startTime: "22:00", endTime: "02:00" },
        { startTime: "15:30", endTime: "19:00" },
      ])
    ).toEqual([
      { inicioMin: h(9), finMin: h(13) },
      { inicioMin: h(15, 30), finMin: h(19) },
    ])
  })
})

describe("tramoDeCita", () => {
  it("lee la hora local del inicio y del fin", () => {
    expect(tramoDeCita({ startTime: local(10, 15), endTime: local(11) })).toEqual({ inicioMin: h(10, 15), finMin: h(11) })
  })

  it("si termina al día siguiente, llega hasta la medianoche", () => {
    expect(tramoDeCita({ startTime: local(23), endTime: local(1, 0, 21) })).toEqual({ inicioMin: h(23), finMin: h(24) })
  })
})

describe("citasPorHora", () => {
  const citas = [
    { id: "b", inicio: h(10, 30) },
    { id: "a", inicio: h(10) },
    { id: "c", inicio: h(12) },
    { id: "temprano", inicio: h(6, 45) },
  ]

  it("pone todas las citas de cada hora, no sólo la primera, en orden", () => {
    const horas = citasPorHora(citas, (cita) => cita.inicio, 6, 13)

    expect(horas.map((fila) => fila.hora)).toEqual([6, 7, 8, 9, 10, 11, 12])
    expect(horas.find((fila) => fila.hora === 10)?.citas.map((cita) => cita.id)).toEqual(["a", "b"])
    expect(horas.find((fila) => fila.hora === 6)?.citas.map((cita) => cita.id)).toEqual(["temprano"])
    expect(horas.find((fila) => fila.hora === 11)?.citas).toEqual([])
  })

  it("con el rango de `rangoDeHoras`, ninguna cita queda afuera", () => {
    const { desde, hasta } = rangoDeHoras(citas.map((cita) => ({ inicioMin: cita.inicio, finMin: cita.inicio + 30 })))
    const horas = citasPorHora(citas, (cita) => cita.inicio, desde, hasta)

    expect(horas.flatMap((fila) => fila.citas).length).toBe(citas.length)
  })
})

describe("columnasDeSolape", () => {
  const lugar = (mapa: ReturnType<typeof columnasDeSolape>, id: string) => mapa.get(id)

  it("una cita sola ocupa todo el ancho", () => {
    const mapa = columnasDeSolape([{ id: "a", inicioMin: h(10), finMin: h(11) }])
    expect(lugar(mapa, "a")).toEqual({ columna: 0, columnas: 1 })
  })

  it("dos que se pisan van lado a lado", () => {
    const mapa = columnasDeSolape([
      { id: "a", inicioMin: h(10), finMin: h(11) },
      { id: "b", inicioMin: h(10, 30), finMin: h(11, 30) },
    ])
    expect(lugar(mapa, "a")).toEqual({ columna: 0, columnas: 2 })
    expect(lugar(mapa, "b")).toEqual({ columna: 1, columnas: 2 })
  })

  it("las que sólo se tocan no comparten ancho", () => {
    const mapa = columnasDeSolape([
      { id: "a", inicioMin: h(10), finMin: h(11) },
      { id: "b", inicioMin: h(11), finMin: h(12) },
    ])
    expect(lugar(mapa, "a")).toEqual({ columna: 0, columnas: 1 })
    expect(lugar(mapa, "b")).toEqual({ columna: 0, columnas: 1 })
  })

  it("en cadena (A con B, B con C) son un grupo, y C reusa la columna libre de A", () => {
    const mapa = columnasDeSolape([
      { id: "a", inicioMin: h(9), finMin: h(10) },
      { id: "b", inicioMin: h(9, 30), finMin: h(11) },
      { id: "c", inicioMin: h(10), finMin: h(11) },
    ])
    expect(lugar(mapa, "a")).toEqual({ columna: 0, columnas: 2 })
    expect(lugar(mapa, "b")).toEqual({ columna: 1, columnas: 2 })
    expect(lugar(mapa, "c")).toEqual({ columna: 0, columnas: 2 })
  })

  it("tres a la vez son tres columnas; un grupo aparte después no se contagia", () => {
    const mapa = columnasDeSolape([
      { id: "a", inicioMin: h(10), finMin: h(11) },
      { id: "b", inicioMin: h(10), finMin: h(11) },
      { id: "c", inicioMin: h(10, 15), finMin: h(10, 45) },
      { id: "d", inicioMin: h(14), finMin: h(15) },
    ])
    expect(new Set(["a", "b", "c"].map((id) => lugar(mapa, id)?.columna))).toEqual(new Set([0, 1, 2]))
    expect(["a", "b", "c"].every((id) => lugar(mapa, id)?.columnas === 3)).toBe(true)
    expect(lugar(mapa, "d")).toEqual({ columna: 0, columnas: 1 })
  })

  it("con duración visual mínima, una cita de 5 minutos se aparta de la que empieza justo después", () => {
    const tramos = [
      { id: "corta", inicioMin: h(10), finMin: h(10, 5) },
      { id: "siguiente", inicioMin: h(10, 10), finMin: h(11) },
    ]
    expect(lugar(columnasDeSolape(tramos), "corta")?.columnas).toBe(1)
    expect(lugar(columnasDeSolape(tramos, 27), "corta")).toEqual({ columna: 0, columnas: 2 })
    expect(lugar(columnasDeSolape(tramos, 27), "siguiente")).toEqual({ columna: 1, columnas: 2 })
  })

  it("todas las citas reciben lugar", () => {
    const tramos = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, inicioMin: h(9 + (i % 3)), finMin: h(10 + (i % 3)) }))
    const mapa = columnasDeSolape(tramos)
    expect(mapa.size).toBe(6)
  })
})
