import { describe, it, expect } from "vitest"
import { correoQueTocaHoy, type NegocioEnPrueba } from "./correos-de-prueba"

const SIETE_DIAS = 7 * 24 * 60 * 60 * 1000

/**
 * Un negocio creado el martes 20/10/2026 a las 12:00 de Santiago (UTC-3 con
 * horario de verano): su prueba termina el martes 27 a las 12:00.
 */
const creado = new Date("2026-10-20T15:00:00Z")
const negocio: NegocioEnPrueba = {
  createdAt: creado,
  pruebaTerminaEl: new Date(creado.getTime() + SIETE_DIAS),
  timezone: "America/Santiago",
}

/** Las 10:00 de Santiago de ese día de octubre: la hora del cron. */
const alas10 = (dia: number) => new Date(`2026-10-${String(dia).padStart(2, "0")}T13:00:00Z`)

const nada = new Set<string>()
const conBienvenida = new Set(["bienvenida"])

describe("correoQueTocaHoy: el ciclo de una prueba de 7 días", () => {
  it("el día en que se crea no toca nada (la bienvenida la manda el registro)", () => {
    expect(correoQueTocaHoy(negocio, nada, new Date("2026-10-20T20:00:00Z"))).toBeNull()
  })

  it("días 1 y 2: nada, si la bienvenida ya salió", () => {
    expect(correoQueTocaHoy(negocio, conBienvenida, alas10(21))).toBeNull()
    expect(correoQueTocaHoy(negocio, conBienvenida, alas10(22))).toBeNull()
  })

  it("día 3: el consejo", () => {
    expect(correoQueTocaHoy(negocio, conBienvenida, alas10(23))).toEqual({
      tipo: "consejo",
      ultimoDia: "2026-10-27",
      diasRestantes: 4,
    })
  })

  it("faltando 3 días para el último: quedan-3-dias, aunque el consejo no haya salido", () => {
    expect(correoQueTocaHoy(negocio, conBienvenida, alas10(24))).toEqual({
      tipo: "quedan-3-dias",
      ultimoDia: "2026-10-27",
      diasRestantes: 3,
    })
  })

  it("el último día: termina-hoy, antes y después de la hora exacta del fin", () => {
    const todos = new Set(["bienvenida", "consejo", "quedan-3-dias"])
    expect(correoQueTocaHoy(negocio, todos, alas10(27))?.tipo).toBe("termina-hoy")
    // 17:00 de Santiago: la prueba ya venció a las 12:00, pero sigue siendo el día.
    expect(correoQueTocaHoy(negocio, todos, new Date("2026-10-27T20:00:00Z"))).toEqual({
      tipo: "termina-hoy",
      ultimoDia: "2026-10-27",
      diasRestantes: 0,
    })
  })

  it("después del último día no toca nada, ni lo pendiente", () => {
    expect(correoQueTocaHoy(negocio, nada, alas10(28))).toBeNull()
    expect(correoQueTocaHoy(negocio, nada, alas10(30))).toBeNull()
  })

  it("lo ya enviado no se repite", () => {
    expect(correoQueTocaHoy(negocio, new Set(["bienvenida", "consejo"]), alas10(23))).toBeNull()
    expect(correoQueTocaHoy(negocio, new Set(["bienvenida", "quedan-3-dias"]), alas10(24))).toBeNull()
    expect(correoQueTocaHoy(negocio, new Set(["termina-hoy"]), alas10(27))).toBeNull()
  })
})

describe("correoQueTocaHoy: reintentos dentro de la ventana", () => {
  it("una bienvenida que falló se reintenta desde el día siguiente", () => {
    expect(correoQueTocaHoy(negocio, nada, alas10(21))?.tipo).toBe("bienvenida")
  })

  it("un día, un correo: con la bienvenida y el consejo pendientes, primero la bienvenida", () => {
    expect(correoQueTocaHoy(negocio, nada, alas10(23))?.tipo).toBe("bienvenida")
    expect(correoQueTocaHoy(negocio, conBienvenida, alas10(23))?.tipo).toBe("consejo")
  })

  it("con el aviso de fin abierto, la bienvenida y el consejo ya no salen", () => {
    expect(correoQueTocaHoy(negocio, nada, alas10(24))?.tipo).toBe("quedan-3-dias")
    expect(correoQueTocaHoy(negocio, new Set(["quedan-3-dias"]), alas10(25))).toBeNull()
  })

  it("quedan-3-dias que falló se reintenta faltando 2 y 1 días, con la cuenta real", () => {
    expect(correoQueTocaHoy(negocio, conBienvenida, alas10(25))).toMatchObject({ tipo: "quedan-3-dias", diasRestantes: 2 })
    expect(correoQueTocaHoy(negocio, conBienvenida, alas10(26))).toMatchObject({ tipo: "quedan-3-dias", diasRestantes: 1 })
  })
})

describe("correoQueTocaHoy: zona horaria", () => {
  /** Creado el lunes 19/10 a las 23:30 de Santiago, que en UTC ya es el martes 20. */
  const deNoche: NegocioEnPrueba = {
    createdAt: new Date("2026-10-20T02:30:00Z"),
    pruebaTerminaEl: new Date(new Date("2026-10-20T02:30:00Z").getTime() + SIETE_DIAS),
    timezone: "America/Santiago",
  }

  it("los días se cuentan en el calendario del negocio, no en UTC", () => {
    // Jueves 22 a las 10:00 de Santiago: es el día 3 (el negocio nació el 19).
    expect(correoQueTocaHoy(deNoche, conBienvenida, alas10(22))?.tipo).toBe("consejo")
    // El mismo instante para un negocio en UTC (nació el 20): es el día 2.
    expect(correoQueTocaHoy({ ...deNoche, timezone: "UTC" }, conBienvenida, alas10(22))).toBeNull()
  })

  it("el último día también es el del negocio: termina el 26 en Santiago, aunque en UTC sea el 27", () => {
    const todos = new Set(["bienvenida", "consejo", "quedan-3-dias"])
    expect(correoQueTocaHoy(deNoche, todos, alas10(26))?.tipo).toBe("termina-hoy")
    expect(correoQueTocaHoy(deNoche, todos, alas10(27))).toBeNull()
  })

  it("el cambio de día es a la medianoche del negocio", () => {
    // 23:59 del 22 en Santiago: todavía día 2. Un minuto después, día 3.
    expect(correoQueTocaHoy(negocio, conBienvenida, new Date("2026-10-23T02:59:00Z"))).toBeNull()
    expect(correoQueTocaHoy(negocio, conBienvenida, new Date("2026-10-23T03:00:00Z"))?.tipo).toBe("consejo")
  })

  it("cuenta días calendario a través del cambio de horario de Santiago (6/9/2026)", () => {
    // Creado el 5/9 a las 00:30 (UTC-4). El 8/9 a las 00:30 (ya UTC-3) es el
    // día 3, aunque hayan pasado 71 horas y no 72.
    const antesDelCambio: NegocioEnPrueba = {
      createdAt: new Date("2026-09-05T04:30:00Z"),
      pruebaTerminaEl: new Date(new Date("2026-09-05T04:30:00Z").getTime() + SIETE_DIAS),
      timezone: "America/Santiago",
    }
    expect(correoQueTocaHoy(antesDelCambio, conBienvenida, new Date("2026-09-08T03:30:00Z"))?.tipo).toBe("consejo")
    expect(correoQueTocaHoy(antesDelCambio, conBienvenida, new Date("2026-09-08T02:59:00Z"))).toBeNull()
  })

  it("una zona inválida cae en Santiago, no revienta", () => {
    expect(correoQueTocaHoy({ ...negocio, timezone: "no/es-una-zona" }, conBienvenida, alas10(23))?.tipo).toBe("consejo")
    expect(correoQueTocaHoy({ ...negocio, timezone: null }, conBienvenida, alas10(23))?.tipo).toBe("consejo")
  })
})

describe("correoQueTocaHoy: prueba extendida y casos raros", () => {
  /** La misma prueba, corrida 7 días por un referido: termina el martes 3/11. */
  const extendida: NegocioEnPrueba = { ...negocio, pruebaTerminaEl: new Date(negocio.pruebaTerminaEl.getTime() + SIETE_DIAS) }

  it("el aviso de fin se corre con la extensión", () => {
    const yaAconsejado = new Set(["bienvenida", "consejo"])
    expect(correoQueTocaHoy(extendida, yaAconsejado, alas10(24))).toBeNull()
    expect(correoQueTocaHoy(extendida, yaAconsejado, alas10(27))).toBeNull()
    expect(correoQueTocaHoy(extendida, yaAconsejado, alas10(31))).toMatchObject({
      tipo: "quedan-3-dias",
      ultimoDia: "2026-11-03",
      diasRestantes: 3,
    })
    expect(correoQueTocaHoy(extendida, new Set([...yaAconsejado, "quedan-3-dias"]), new Date("2026-11-03T13:00:00Z"))?.tipo).toBe(
      "termina-hoy",
    )
  })

  it("con la extensión, el consejo tiene más días de ventana", () => {
    expect(correoQueTocaHoy(extendida, conBienvenida, alas10(27))?.tipo).toBe("consejo")
  })

  it("si quedan-3-dias salió antes de la extensión, no se repite", () => {
    const yaAvisado = new Set(["bienvenida", "consejo", "quedan-3-dias"])
    expect(correoQueTocaHoy(extendida, yaAvisado, alas10(31))).toBeNull()
  })

  it("un negocio creado después de `ahora` (reloj corrido) no recibe nada", () => {
    expect(correoQueTocaHoy(negocio, nada, alas10(19))).toBeNull()
  })

  it("una prueba que termina antes de lo que mide la ventana del consejo: el aviso de fin manda", () => {
    const corta: NegocioEnPrueba = { ...negocio, pruebaTerminaEl: new Date("2026-10-24T15:00:00Z") }
    expect(correoQueTocaHoy(corta, conBienvenida, alas10(23))).toMatchObject({ tipo: "quedan-3-dias", diasRestantes: 1 })
  })
})
