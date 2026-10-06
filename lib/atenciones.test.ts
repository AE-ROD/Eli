import { describe, it, expect } from "vitest"
import {
  ESTADOS_ACTIVOS,
  ESTADOS_DE_ATENCION,
  aCentavos,
  deCentavos,
  errorDeCobro,
  esEstadoActivo,
  esMontoDePagoValido,
  esPrecioValido,
  idDeProfesional,
  nombreDeEstado,
  requisitoFaltante,
  tieneCentavosExactos,
  tiemposDeTransicion,
  totalEnCentavos,
  transicionPermitida,
} from "./atenciones"

const deCarla = (price: number) => ({ memberId: "m-carla", byOwner: false, price })
const deLaDueña = (price: number) => ({ memberId: null, byOwner: true, price })
/** Quien la hizo dejó el equipo: `memberId` quedó en null y no es del dueño. */
const deExMiembro = (price: number) => ({ memberId: null, byOwner: false, price })

describe("estados", () => {
  it("son los cinco del tablero, en kebab-case como los de la cita", () => {
    expect(ESTADOS_DE_ATENCION.map((estado) => estado.id)).toEqual([
      "en-espera",
      "en-atencion",
      "por-cobrar",
      "finalizada",
      "anulada",
    ])
  })

  it("los activos son las tres columnas que se trabajan, en orden", () => {
    expect([...ESTADOS_ACTIVOS]).toEqual(["en-espera", "en-atencion", "por-cobrar"])
    expect(esEstadoActivo("por-cobrar")).toBe(true)
    expect(esEstadoActivo("finalizada")).toBe(false)
    expect(esEstadoActivo("anulada")).toBe(false)
    expect(esEstadoActivo("cualquiera")).toBe(false)
  })

  it("nombreDeEstado muestra el nombre y no rompe con uno desconocido", () => {
    expect(nombreDeEstado("en-atencion")).toBe("En atención")
    expect(nombreDeEstado("por-cobrar")).toBe("Por cobrar")
    expect(nombreDeEstado("raro")).toBe("Estado desconocido")
    expect(nombreDeEstado("constructor")).toBe("Estado desconocido")
  })
})

describe("transicionPermitida", () => {
  it.each([
    ["en-espera", "en-atencion"],
    ["en-atencion", "por-cobrar"],
    ["por-cobrar", "en-atencion"],
    ["en-atencion", "en-espera"],
    ["por-cobrar", "finalizada"],
    ["en-espera", "anulada"],
    ["en-atencion", "anulada"],
    ["por-cobrar", "anulada"],
    ["finalizada", "anulada"],
  ])("de %s a %s, sí", (desde, hacia) => {
    expect(transicionPermitida(desde, hacia)).toBe(true)
  })

  it.each([
    // Saltarse una columna dejaría sin marcar cuándo empezó o terminó.
    ["en-espera", "por-cobrar"],
    ["por-cobrar", "en-espera"],
    // A finalizada sólo se llega cobrando.
    ["en-espera", "finalizada"],
    ["en-atencion", "finalizada"],
    // Lo final no vuelve al tablero.
    ["finalizada", "por-cobrar"],
    ["anulada", "en-espera"],
    ["anulada", "anulada"],
    ["finalizada", "finalizada"],
    // Quedarse donde está no es un movimiento.
    ["en-espera", "en-espera"],
    ["raro", "en-atencion"],
    ["en-espera", "raro"],
  ])("de %s a %s, no", (desde, hacia) => {
    expect(transicionPermitida(desde, hacia)).toBe(false)
  })
})

describe("tiemposDeTransicion", () => {
  const ahora = new Date("2026-10-06T15:00:00.000Z")

  it("hacia adelante marca el momento", () => {
    expect(tiemposDeTransicion("en-espera", "en-atencion", ahora)).toEqual({ startedAt: ahora })
    expect(tiemposDeTransicion("en-atencion", "por-cobrar", ahora)).toEqual({ readyAt: ahora })
  })

  it("hacia atrás borra el del paso que se deshace", () => {
    expect(tiemposDeTransicion("por-cobrar", "en-atencion", ahora)).toEqual({ readyAt: null })
    expect(tiemposDeTransicion("en-atencion", "en-espera", ahora)).toEqual({ startedAt: null })
  })
})

describe("dinero en centavos", () => {
  it("aCentavos redondea el ruido del punto flotante", () => {
    expect(0.1 + 0.2).not.toBe(0.3)
    expect(aCentavos(0.1) + aCentavos(0.2)).toBe(aCentavos(0.3))
    expect(aCentavos(1.15)).toBe(115)
    expect(deCentavos(30)).toBe(0.3)
  })

  it("totalEnCentavos suma las líneas en centavos", () => {
    expect(totalEnCentavos([{ price: 0.1 }, { price: 0.2 }])).toBe(30)
    expect(totalEnCentavos([{ price: 8000 }, { price: 25000 }])).toBe(3_300_000)
    expect(totalEnCentavos([])).toBe(0)
  })

  it("tieneCentavosExactos acepta hasta dos decimales y nada más", () => {
    expect(tieneCentavosExactos(8000)).toBe(true)
    expect(tieneCentavosExactos(0.3)).toBe(true)
    expect(tieneCentavosExactos(1234567.89)).toBe(true)
    expect(tieneCentavosExactos(10.005)).toBe(false)
    expect(tieneCentavosExactos(0.001)).toBe(false)
    expect(tieneCentavosExactos(Number.NaN)).toBe(false)
    expect(tieneCentavosExactos(Number.POSITIVE_INFINITY)).toBe(false)
  })

  it("un precio puede ser cero (cortesía) pero no negativo", () => {
    expect(esPrecioValido(0)).toBe(true)
    expect(esPrecioValido(8000)).toBe(true)
    expect(esPrecioValido(-1)).toBe(false)
    expect(esPrecioValido(2_000_000_000)).toBe(false)
  })

  it("un pago tiene que ser mayor que cero", () => {
    expect(esMontoDePagoValido(0.01)).toBe(true)
    expect(esMontoDePagoValido(0)).toBe(false)
    expect(esMontoDePagoValido(-5)).toBe(false)
  })
})

describe("idDeProfesional", () => {
  it("el miembro por su id, el dueño como `duenio` y quien ya no está como null", () => {
    expect(idDeProfesional(deCarla(1))).toBe("m-carla")
    expect(idDeProfesional(deLaDueña(1))).toBe("duenio")
    expect(idDeProfesional(deExMiembro(1))).toBeNull()
  })
})

describe("requisitoFaltante", () => {
  it("en espera no pide nada", () => {
    expect(requisitoFaltante("en-espera", [])).toBeNull()
  })

  it("para empezar la atención, al menos un servicio con su profesional", () => {
    expect(requisitoFaltante("en-atencion", [])).toMatch(/al menos un servicio con su profesional/)
    expect(requisitoFaltante("en-atencion", [deExMiembro(8000)])).toMatch(/al menos un servicio con su profesional/)
    expect(requisitoFaltante("en-atencion", [deExMiembro(8000), deCarla(8000)])).toBeNull()
    expect(requisitoFaltante("en-atencion", [deLaDueña(8000)])).toBeNull()
  })

  it.each(["por-cobrar", "finalizada"])("para %s: al menos un servicio, todos con profesional y precio válido", (destino) => {
    expect(requisitoFaltante(destino, [])).toMatch(/al menos un servicio/)
    expect(requisitoFaltante(destino, [deCarla(8000), deExMiembro(8000)])).toMatch(/sin profesional/)
    expect(requisitoFaltante(destino, [deCarla(-1)])).toMatch(/precio inválido/)
    expect(requisitoFaltante(destino, [deCarla(10.005)])).toMatch(/precio inválido/)
    expect(requisitoFaltante(destino, [deCarla(8000), deLaDueña(0)])).toBeNull()
  })
})

describe("errorDeCobro", () => {
  it("acepta pagos que suman el total exacto, en centavos", () => {
    expect(errorDeCobro(aCentavos(0.3), [{ medio: "efectivo", monto: 0.1 }, { medio: "tarjeta-debito", monto: 0.2 }])).toBeNull()
    expect(errorDeCobro(3_300_000, [{ medio: "efectivo", monto: 20000 }, { medio: "transferencia", monto: 13000 }])).toBeNull()
  })

  it("un total de cero se cobra sin pagos: cortesía", () => {
    expect(errorDeCobro(0, [])).toBeNull()
  })

  it("con total de cero, cualquier pago sobra", () => {
    expect(errorDeCobro(0, [{ medio: "efectivo", monto: 100 }])).toMatch(/suman \$100 y el total es \$0/)
  })

  it("si no suman el total, lo dice con las dos cifras", () => {
    expect(errorDeCobro(3_300_000, [{ medio: "efectivo", monto: 30000 }])).toBe(
      "Los pagos suman $30.000 y el total es $33.000: tienen que coincidir."
    )
  })

  it("sin pagos y con total, pide indicar cómo se pagó", () => {
    expect(errorDeCobro(800_000, [])).toMatch(/Falta indicar cómo se pagó/)
  })

  it("rechaza medios fuera del catálogo y montos inválidos", () => {
    expect(errorDeCobro(100, [{ medio: "cheque", monto: 1 }])).toMatch(/medio de pago que no existe/)
    expect(errorDeCobro(100, [{ medio: "efectivo", monto: 0 }, { medio: "efectivo", monto: 1 }])).toMatch(/mayor que cero/)
    expect(errorDeCobro(100, [{ medio: "efectivo", monto: 2 }, { medio: "efectivo", monto: -1 }])).toMatch(/mayor que cero/)
    expect(errorDeCobro(100, [{ medio: "efectivo", monto: 0.995 }, { medio: "efectivo", monto: 0.005 }])).toMatch(/dos decimales/)
  })
})
