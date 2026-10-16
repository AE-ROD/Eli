import { describe, it, expect } from "vitest"
import {
  ESTADOS_ACTIVOS,
  ESTADOS_DE_ATENCION,
  MAXIMO_DE_LINEAS_POR_ATENCION,
  MONTO_MAXIMO,
  TOTAL_MAXIMO_CENTAVOS,
  aCentavos,
  deCentavos,
  errorDeCantidadDeLineas,
  errorDeCobro,
  errorDeTotal,
  esEstadoActivo,
  esMontoDePagoValido,
  esPrecioValido,
  idDeProfesional,
  mismoNombreDeServicio,
  nombreDeEstado,
  requisitoFaltante,
  sePuedeDeshacerLaLlegada,
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

  it("de por cobrar a en atención borra cuándo quedó lista: todavía no lo está", () => {
    expect(tiemposDeTransicion("por-cobrar", "en-atencion", ahora)).toEqual({ readyAt: null })
  })

  it("de en atención a en espera conserva cuándo empezó: es el rastro de que empezó", () => {
    expect(tiemposDeTransicion("en-atencion", "en-espera", ahora)).toEqual({})
  })

  it("al volver a empezar marca el momento nuevo", () => {
    const despues = new Date("2026-10-06T15:30:00.000Z")
    expect(tiemposDeTransicion("en-espera", "en-atencion", despues)).toEqual({ startedAt: despues })
  })
})

describe("dinero en centavos", () => {
  it("aCentavos redondea el ruido del punto flotante", () => {
    expect(0.1 + 0.2).not.toBe(0.3)
    expect(aCentavos(0.1) + aCentavos(0.2)).toBe(aCentavos(0.3))
    expect(aCentavos(1.15)).toBe(115)
    expect(deCentavos(30)).toBe(0.3)
  })

  it("totalEnCentavos suma las líneas como se guardan, en centavos enteros", () => {
    expect(totalEnCentavos([{ priceCents: 10 }, { priceCents: 20 }])).toBe(30)
    expect(totalEnCentavos([{ priceCents: 800_000 }, { priceCents: 2_500_000 }])).toBe(3_300_000)
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

describe("topes del dinero: nada desborda la columna Int de Postgres", () => {
  const INT_MAXIMO = 2_147_483_647

  it("el total máximo cabe en la columna, y en un number los centavos siguen exactos", () => {
    expect(TOTAL_MAXIMO_CENTAVOS).toBeLessThanOrEqual(INT_MAXIMO)
    expect(Number.isSafeInteger(TOTAL_MAXIMO_CENTAVOS)).toBe(true)
  })

  it("un precio o un pago llega justo hasta el tope, en unidades: 20 millones", () => {
    expect(MONTO_MAXIMO).toBe(20_000_000)
    expect(aCentavos(MONTO_MAXIMO)).toBeLessThanOrEqual(INT_MAXIMO)
    expect(esPrecioValido(MONTO_MAXIMO)).toBe(true)
    expect(esPrecioValido(MONTO_MAXIMO + 0.01)).toBe(false)
    expect(esMontoDePagoValido(MONTO_MAXIMO)).toBe(true)
    expect(esMontoDePagoValido(MONTO_MAXIMO + 0.01)).toBe(false)
  })

  it("el total de una atención se rechaza con un mensaje en cuanto pasa del tope, aunque cada línea sea válida", () => {
    expect(errorDeTotal(TOTAL_MAXIMO_CENTAVOS)).toBeNull()
    expect(errorDeTotal(TOTAL_MAXIMO_CENTAVOS + 1)).toBe(
      "El total de la atención no puede pasar de $20.000.000: divídela en dos."
    )
    // Dos líneas válidas que juntas no caben.
    expect(errorDeTotal(totalEnCentavos([{ priceCents: aCentavos(MONTO_MAXIMO) }, { priceCents: 1 }]))).not.toBeNull()
  })

  it("una atención tiene hasta 20 servicios", () => {
    expect(MAXIMO_DE_LINEAS_POR_ATENCION).toBe(20)
    expect(errorDeCantidadDeLineas(20)).toBeNull()
    expect(errorDeCantidadDeLineas(21)).toBe("Una atención puede tener hasta 20 servicios.")
  })
})

describe("sePuedeDeshacerLaLlegada", () => {
  it("sólo de una reserva que espera y nunca empezó", () => {
    expect(sePuedeDeshacerLaLlegada({ status: "en-espera", appointmentId: "cita-1", startedAt: null })).toBe(true)
  })

  it.each([
    ["sin reserva: no hay adónde volver", "en-espera", null],
    ["ya empezó", "en-atencion", "cita-1"],
    ["por cobrar", "por-cobrar", "cita-1"],
    ["cobrada", "finalizada", "cita-1"],
    ["anulada", "anulada", "cita-1"],
  ])("no: %s", (_caso, status, appointmentId) => {
    expect(sePuedeDeshacerLaLlegada({ status, appointmentId, startedAt: null })).toBe(false)
  })

  it("no si empezó y la volvieron a espera: eso se anula", () => {
    // Desde la base llega como `Date`; desde la API, como texto ISO.
    expect(sePuedeDeshacerLaLlegada({ status: "en-espera", appointmentId: "cita-1", startedAt: new Date() })).toBe(false)
    expect(
      sePuedeDeshacerLaLlegada({ status: "en-espera", appointmentId: "cita-1", startedAt: "2026-10-06T15:00:00.000Z" })
    ).toBe(false)
  })

  it("si startedAt no viene (un JSON sin la clave, por fuera de los tipos), falla cerrado: no se deshace", () => {
    const sinStartedAt = JSON.parse('{ "status": "en-espera", "appointmentId": "cita-1" }')
    expect(sePuedeDeshacerLaLlegada(sinStartedAt)).toBe(false)
  })
})

describe("mismoNombreDeServicio", () => {
  it("sin distinguir mayúsculas ni espacios al borde", () => {
    expect(mismoNombreDeServicio("Corte", "corte")).toBe(true)
    expect(mismoNombreDeServicio("Corte de pelo", "  CORTE DE PELO ")).toBe(true)
    expect(mismoNombreDeServicio("Ñandú Spa", "ñandú spa")).toBe(true)
  })

  it("nada más laxo: ni acentos de menos ni palabras de más", () => {
    expect(mismoNombreDeServicio("Peinado", "Peinado y lavado")).toBe(false)
    expect(mismoNombreDeServicio("Depilación", "Depilacion")).toBe(false)
    expect(mismoNombreDeServicio("Corte", "")).toBe(false)
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
