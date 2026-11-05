import { describe, it, expect } from "vitest"
import { instanteEn } from "@/lib/zona-horaria"
import { citasPorHora, columnasDeSolape, rangoDeHoras, recortarAHoras, tramoDeCita, tramoEnElDia, tramosDeFranjas } from "./_disposicion"

const h = (hora: number, minutos = 0) => hora * 60 + minutos

const ZONA = "America/Santiago"
const dosCifras = (n: number) => String(n).padStart(2, "0")

/**
 * Un instante ISO a esa hora del negocio (Santiago) el `dia` de octubre de
 * 2026, como llegan las citas. No depende de la zona de la máquina de los tests.
 */
const local = (hora: number, minutos = 0, dia = 20) =>
  instanteEn(`2026-10-${dosCifras(dia)}`, `${dosCifras(hora)}:${dosCifras(minutos)}`, ZONA).toISOString()

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
    expect(tramoDeCita({ startTime: local(10, 15), endTime: local(11) }, ZONA)).toEqual({ inicioMin: h(10, 15), finMin: h(11) })
  })

  it("se lee en la zona del negocio, no en la del navegador (#99)", () => {
    // 13:00 UTC: las 10:00 en Santiago, las 22:00 en Tokio.
    const cita = { startTime: "2026-10-20T13:00:00.000Z", endTime: "2026-10-20T14:30:00.000Z" }
    expect(tramoDeCita(cita, ZONA)).toEqual({ inicioMin: h(10), finMin: h(11, 30) })
    expect(tramoDeCita(cita, "Asia/Tokyo")).toEqual({ inicioMin: h(22), finMin: h(23, 30) })
  })

  it("si termina al día siguiente, llega hasta la medianoche", () => {
    expect(tramoDeCita({ startTime: local(23), endTime: local(1, 0, 21) }, ZONA)).toEqual({ inicioMin: h(23), finMin: h(24) })
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

describe("tramoEnElDia", () => {
  const dia20 = new Date(2026, 9, 20)

  it("un bloqueo dentro del día: sus minutos", () => {
    expect(tramoEnElDia({ startTime: local(13), endTime: local(14) }, dia20, ZONA)).toEqual({ inicioMin: h(13), finMin: h(14) })
  })

  it("uno que viene del día anterior empieza a la medianoche; uno que sigue al otro día llega al final", () => {
    expect(tramoEnElDia({ startTime: local(22, 0, 19), endTime: local(2) }, dia20, ZONA)).toEqual({ inicioMin: 0, finMin: h(2) })
    expect(tramoEnElDia({ startTime: local(22), endTime: local(2, 0, 21) }, dia20, ZONA)).toEqual({ inicioMin: h(22), finMin: 24 * 60 })
    expect(tramoEnElDia({ startTime: local(9, 0, 19), endTime: local(9, 0, 22) }, dia20, ZONA)).toEqual({ inicioMin: 0, finMin: 24 * 60 })
  })

  it("el día es el del negocio: un bloqueo de 22:00 a 23:00 en Santiago es del día siguiente en Tokio", () => {
    const bloqueo = { startTime: local(22), endTime: local(23) }
    expect(tramoEnElDia(bloqueo, dia20, "Asia/Tokyo")).toBeNull()
    expect(tramoEnElDia(bloqueo, new Date(2026, 9, 21), "Asia/Tokyo")).toEqual({ inicioMin: h(10), finMin: h(11) })
  })

  it("no toca el día: null; terminar justo a la medianoche no es caer en el día siguiente", () => {
    expect(tramoEnElDia({ startTime: local(10, 0, 21), endTime: local(11, 0, 21) }, dia20, ZONA)).toBeNull()
    expect(tramoEnElDia({ startTime: local(22, 0, 19), endTime: local(0) }, dia20, ZONA)).toBeNull()
  })
})

describe("recortarAHoras", () => {
  it("un bloqueo de día entero se recorta a las horas que se dibujan", () => {
    expect(recortarAHoras({ inicioMin: 0, finMin: 24 * 60 }, 8, 20)).toEqual({ inicioMin: h(8), finMin: h(20) })
  })

  it("lo que queda fuera de las horas dibujadas: null", () => {
    expect(recortarAHoras({ inicioMin: h(5), finMin: h(7) }, 8, 20)).toBeNull()
    expect(recortarAHoras({ inicioMin: h(20), finMin: h(22) }, 8, 20)).toBeNull()
  })
})
