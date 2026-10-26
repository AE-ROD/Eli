import { describe, it, expect, vi, afterEach } from "vitest"
import {
  comoTexto,
  diasDeLaSemanaDe,
  limitesDelMesDe,
  desplazarFecha,
  formatearHora,
  horaConArticulo,
  zonaDelDispositivo,
  duracionEnMinutos,
  duracionParaMostrar,
  esHoy,
  diaParaLeer,
  horasEnPunto,
  formatearDuracionDeServicio,
  deTexto,
  rangoDelDia,
  tiempoDesde,
  fechaRelativa,
} from "./fechas"

describe("comoTexto", () => {
  it("escribe la fecha local, no la UTC", () => {
    // 21:00 en un huso al oeste de Greenwich ya es el día siguiente en UTC.
    // `toISOString()` devolvería el día de después y correría toda la semana.
    const nocheDelOcho = new Date(2026, 2, 8, 21, 0, 0)
    expect(comoTexto(nocheDelOcho)).toBe("2026-03-08")
  })

  it("rellena mes y día con cero", () => {
    expect(comoTexto(new Date(2026, 0, 5))).toBe("2026-01-05")
  })
})

describe("diasDeLaSemanaDe", () => {
  it("devuelve siete días, de domingo a sábado", () => {
    const miercoles = new Date(2026, 2, 11)
    const dias = diasDeLaSemanaDe(miercoles)

    expect(dias).toHaveLength(7)
    expect(dias.map(comoTexto)).toEqual([
      "2026-03-08", "2026-03-09", "2026-03-10", "2026-03-11",
      "2026-03-12", "2026-03-13", "2026-03-14",
    ])
  })

  it("cruza el cambio de mes sin repetir ni saltear días", () => {
    const dias = diasDeLaSemanaDe(new Date(2026, 1, 25))
    expect(dias.map(comoTexto)).toEqual([
      "2026-02-22", "2026-02-23", "2026-02-24", "2026-02-25",
      "2026-02-26", "2026-02-27", "2026-02-28",
    ])
  })

  it("no modifica la fecha que recibe", () => {
    const original = new Date(2026, 2, 11)
    diasDeLaSemanaDe(original)
    expect(comoTexto(original)).toBe("2026-03-11")
  })
})

describe("limitesDelMesDe", () => {
  it("toma el mes entero", () => {
    const { desde, hasta } = limitesDelMesDe(new Date(2026, 2, 17))
    expect(comoTexto(desde)).toBe("2026-03-01")
    expect(comoTexto(hasta)).toBe("2026-03-31")
  })

  it("acierta el último día de febrero en un año bisiesto", () => {
    expect(comoTexto(limitesDelMesDe(new Date(2028, 1, 10)).hasta)).toBe("2028-02-29")
  })
})

describe("desplazarFecha", () => {
  it("mueve por día, por semana y por mes", () => {
    const base = new Date(2026, 2, 11)
    expect(comoTexto(desplazarFecha(base, "dia", 1))).toBe("2026-03-12")
    expect(comoTexto(desplazarFecha(base, "semana", -1))).toBe("2026-03-04")
    expect(comoTexto(desplazarFecha(base, "mes", 1))).toBe("2026-04-11")
  })

  it("no modifica la fecha que recibe", () => {
    const original = new Date(2026, 2, 11)
    desplazarFecha(original, "mes", 3)
    expect(comoTexto(original)).toBe("2026-03-11")
  })
})

describe("formatearHora", () => {
  // Se arma con `new Date(año, mes, ...)` y `toISOString()` a propósito: ida y
  // vuelta por la zona local, así el test da lo mismo en cualquier huso. Es un
  // 15 de julio porque ningún huso cambia la hora ese día: en un día de cambio
  // (8 de marzo en La Habana, por ejemplo) la 00:30 ni siquiera existe.
  const instante = (hora: number, minuto: number) =>
    new Date(2026, 6, 15, hora, minuto).toISOString()

  it("escribe la hora local en 24h, con cero a la izquierda", () => {
    expect(formatearHora(instante(9, 5))).toBe("09:05")
    expect(formatearHora(instante(21, 30))).toBe("21:30")
  })

  it("la hora de la tarde sigue en 24h, sin am/pm", () => {
    expect(formatearHora(instante(14, 0))).toBe("14:00")
  })

  it("después de medianoche empieza en 00, no en 24", () => {
    expect(formatearHora(instante(0, 30))).toBe("00:30")
  })
})

describe("horaConArticulo", () => {
  // Igual que en formatearHora: ida y vuelta por la zona local, un día sin cambio de hora.
  const instante = (hora: number, minuto: number) => new Date(2026, 6, 15, hora, minuto).toISOString()

  it("dice la hora con su artículo, para leerla dentro de una frase", () => {
    expect(horaConArticulo(instante(10, 30))).toBe("las 10:30")
    expect(horaConArticulo(instante(0, 15))).toBe("las 00:15")
    expect(horaConArticulo(instante(21, 5))).toBe("las 21:05")
  })

  it("la una va en singular", () => {
    expect(horaConArticulo(instante(1, 15))).toBe("la 01:15")
    expect(horaConArticulo(instante(13, 15))).toBe("las 13:15")
  })
})

describe("zonaDelDispositivo", () => {
  it("es la zona IANA que informa el entorno", () => {
    expect(zonaDelDispositivo()).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
    expect(zonaDelDispositivo()).not.toBe("")
  })
})

describe("duracionEnMinutos", () => {
  it("cuenta los minutos entre el inicio y el fin de la cita", () => {
    expect(duracionEnMinutos("2026-03-08T10:00:00.000Z", "2026-03-08T10:45:00.000Z")).toBe(45)
  })

  it("cruza la hora y la medianoche sin perder minutos", () => {
    expect(duracionEnMinutos("2026-03-08T23:30:00.000Z", "2026-03-09T01:00:00.000Z")).toBe(90)
  })

  it("una cita que termina cuando empieza dura cero", () => {
    expect(duracionEnMinutos("2026-03-08T10:00:00.000Z", "2026-03-08T10:00:00.000Z")).toBe(0)
  })

  it("redondea al minuto más cercano", () => {
    expect(duracionEnMinutos("2026-03-08T10:00:00.000Z", "2026-03-08T10:00:29.000Z")).toBe(0)
    expect(duracionEnMinutos("2026-03-08T10:00:00.000Z", "2026-03-08T10:00:31.000Z")).toBe(1)
  })
})

describe("duracionParaMostrar", () => {
  it("una cita normal muestra sus minutos reales", () => {
    expect(duracionParaMostrar("2026-03-08T10:00:00.000Z", "2026-03-08T10:45:00.000Z")).toBe(45)
    expect(duracionParaMostrar("2026-03-08T23:30:00.000Z", "2026-03-09T01:00:00.000Z")).toBe(90)
  })

  it("una cita que termina cuando empieza se muestra como de un minuto, no de cero", () => {
    expect(duracionParaMostrar("2026-03-08T10:00:00.000Z", "2026-03-08T10:00:00.000Z")).toBe(1)
  })

  it("una cita mal cargada, que termina antes de empezar, tampoco muestra minutos negativos", () => {
    expect(duracionParaMostrar("2026-03-08T11:00:00.000Z", "2026-03-08T10:00:00.000Z")).toBe(1)
  })

  it("redondea igual que duracionEnMinutos antes de aplicar el mínimo", () => {
    expect(duracionParaMostrar("2026-03-08T10:00:00.000Z", "2026-03-08T10:00:29.000Z")).toBe(1)
    expect(duracionParaMostrar("2026-03-08T10:00:00.000Z", "2026-03-08T10:01:31.000Z")).toBe(2)
  })
})

describe("esHoy", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("compara por día local, sin importar la hora", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 8, 10, 0))

    expect(esHoy(new Date(2026, 2, 8, 0, 0))).toBe(true)
    expect(esHoy(new Date(2026, 2, 8, 23, 59))).toBe(true)
  })

  it("ayer y mañana no son hoy, aunque estén a un minuto", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 8, 10, 0))

    expect(esHoy(new Date(2026, 2, 7, 23, 59))).toBe(false)
    expect(esHoy(new Date(2026, 2, 9, 0, 0))).toBe(false)
  })

  it("el mismo día de otro mes o de otro año no es hoy", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 8, 10, 0))

    expect(esHoy(new Date(2026, 3, 8, 10, 0))).toBe(false)
    expect(esHoy(new Date(2025, 2, 8, 10, 0))).toBe(false)
  })
})

describe("formatearDuracionDeServicio", () => {
  it("menos de una hora va en minutos", () => {
    expect(formatearDuracionDeServicio(15)).toBe("15 min")
    expect(formatearDuracionDeServicio(45)).toBe("45 min")
  })

  it("horas justas van sin minutos", () => {
    expect(formatearDuracionDeServicio(60)).toBe("1h")
    expect(formatearDuracionDeServicio(120)).toBe("2h")
  })

  it("horas con resto van con los dos", () => {
    expect(formatearDuracionDeServicio(90)).toBe("1h 30min")
    expect(formatearDuracionDeServicio(135)).toBe("2h 15min")
  })
})

describe("deTexto", () => {
  it("lee el texto de un campo de fecha como la medianoche local de ese día", () => {
    const fecha = deTexto("2026-03-08")
    expect(fecha).toEqual(new Date(2026, 2, 8))
    expect(comoTexto(fecha!)).toBe("2026-03-08")
  })

  it("es la inversa de comoTexto", () => {
    for (const texto of ["2026-01-01", "2026-12-31", "2028-02-29"]) {
      expect(comoTexto(deTexto(texto)!)).toBe(texto)
    }
  })

  it("una fecha que no existe da null en vez de correrse a otro día", () => {
    expect(deTexto("2026-02-31")).toBeNull()
    expect(deTexto("2026-13-01")).toBeNull()
    expect(deTexto("2027-02-29")).toBeNull()
  })

  it("un texto que no tiene la forma de fecha da null", () => {
    expect(deTexto("")).toBeNull()
    expect(deTexto("08/03/2026")).toBeNull()
    expect(deTexto("2026-3-8")).toBeNull()
  })
})

describe("rangoDelDia", () => {
  it("va de la medianoche local del día a la del día siguiente", () => {
    const { desde, hasta } = rangoDelDia(new Date(2026, 9, 6, 15, 30))
    expect(desde).toEqual(new Date(2026, 9, 6, 0, 0, 0, 0))
    expect(hasta).toEqual(new Date(2026, 9, 7, 0, 0, 0, 0))
  })

  it("a cualquier hora del día da el mismo rango", () => {
    const temprano = rangoDelDia(new Date(2026, 9, 6, 0, 0))
    const tarde = rangoDelDia(new Date(2026, 9, 6, 23, 59, 59))
    expect(temprano).toEqual(tarde)
  })

  it("cruza el fin de mes y el fin de año con el calendario", () => {
    expect(comoTexto(rangoDelDia(new Date(2026, 9, 31, 12)).hasta)).toBe("2026-11-01")
    expect(comoTexto(rangoDelDia(new Date(2026, 11, 31, 12)).hasta)).toBe("2027-01-01")
  })

  it("no modifica la fecha que recibe", () => {
    const original = new Date(2026, 9, 6, 15, 30)
    rangoDelDia(original)
    expect(original).toEqual(new Date(2026, 9, 6, 15, 30))
  })
})

describe("tiempoDesde", () => {
  const ahora = new Date("2026-10-06T15:00:00.000Z").getTime()
  const antes = (minutos: number) => new Date(ahora - minutos * 60000).toISOString()

  it("menos de un minuto es recién", () => {
    expect(tiempoDesde(antes(0), ahora)).toBe("recién")
    expect(tiempoDesde(new Date(ahora - 59_000).toISOString(), ahora)).toBe("recién")
  })

  it("en minutos y horas, con el formato de la línea de tiempo del profesional", () => {
    expect(tiempoDesde(antes(5), ahora)).toBe("hace 5 min")
    expect(tiempoDesde(antes(60), ahora)).toBe("hace 1 h")
    expect(tiempoDesde(antes(80), ahora)).toBe("hace 1 h 20 min")
  })

  it("desde un día en adelante cuenta días: una atención que quedó abierta ayer", () => {
    expect(tiempoDesde(antes(24 * 60), ahora)).toBe("hace 1 día")
    expect(tiempoDesde(antes(3 * 24 * 60 + 10), ahora)).toBe("hace 3 días")
  })

  it("un instante en el futuro (un reloj atrasado) no da un tiempo negativo", () => {
    expect(tiempoDesde(antes(-10), ahora)).toBe("recién")
  })

  it("un instante ilegible no rompe: se lee como recién", () => {
    expect(tiempoDesde("no es una fecha", ahora)).toBe("recién")
  })
})

describe("diaParaLeer", () => {
  it("dice el día entero, sin el año", () => {
    expect(diaParaLeer(new Date(2026, 9, 7))).toBe("miércoles, 7 de octubre")
  })
})

describe("horasEnPunto", () => {
  it("va de la primera hora a la anterior a la última, con ceros a la izquierda", () => {
    expect(horasEnPunto(8, 11)).toEqual(["08:00", "09:00", "10:00"])
  })

  it("la jornada de la agenda, de 8 a 20, son doce franjas", () => {
    const horas = horasEnPunto(8, 20)
    expect(horas).toHaveLength(12)
    expect(horas[0]).toBe("08:00")
    expect(horas[11]).toBe("19:00")
  })
})

describe("fechaRelativa", () => {
  // Las fechas se arman en la zona del dispositivo, como las cuenta la función.
  const ahora = new Date(2026, 9, 26, 18, 0).getTime()
  const el = (mes: number, dia: number, hora = 10) => new Date(2026, mes, dia, hora, 0).toISOString()

  it.each([
    ["el mismo día, más temprano", el(9, 26, 8), "Hoy"],
    ["el mismo día, más tarde", el(9, 26, 21), "Hoy"],
    ["ayer a la mañana", el(9, 25), "Ayer"],
    ["hace 3 días", el(9, 23), "Hace 3 días"],
    ["hace 6 días", el(9, 20), "Hace 6 días"],
    ["hace 10 días", el(9, 16), "Hace 1 semana"],
    ["hace 20 días", el(9, 6), "Hace 2 semanas"],
    ["hace 45 días", el(8, 11), "Hace 1 mes"],
    ["hace 4 meses", el(5, 20), "Hace 4 meses"],
  ])("en el pasado: %s → %s", (_caso, iso, esperado) => {
    expect(fechaRelativa(iso, ahora)).toBe(esperado)
  })

  it.each([
    ["mañana a la mañana, aunque falten menos de 24 horas", el(9, 27, 9), "Mañana"],
    ["en 3 días", el(9, 29), "En 3 días"],
    ["en 6 días", el(10, 1), "En 6 días"],
    ["en 10 días", el(10, 5), "En 1 semana"],
    ["en 20 días", el(10, 15), "En 2 semanas"],
    ["en 45 días", el(11, 10), "En 1 mes"],
  ])("en el futuro: %s → %s", (_caso, iso, esperado) => {
    expect(fechaRelativa(iso, ahora)).toBe(esperado)
  })

  it("nunca dice un número negativo", () => {
    for (let dias = -400; dias <= 400; dias += 1) {
      const iso = new Date(2026, 9, 26 + dias, 12, 0).toISOString()
      expect(fechaRelativa(iso, ahora)).not.toMatch(/-/)
    }
  })
})
