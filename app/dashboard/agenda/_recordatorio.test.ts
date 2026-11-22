import { describe, it, expect } from "vitest"
import { vocabularioDe } from "@/lib/vocabulario"
import { enlaceDeRecordatorio, mensajeDeRecordatorio, sePuedeRecordar, type CitaParaRecordar } from "./_recordatorio"

const SANTIAGO = "America/Santiago"
// Noviembre de 2026: Santiago va 3 horas detrás de UTC. Lunes 23 a las 09:00 de allá.
const AHORA = new Date("2026-11-23T12:00:00Z")

function cita(cambios: Partial<CitaParaRecordar> = {}): CitaParaRecordar {
  return {
    status: "confirmada",
    startTime: "2026-11-24T13:00:00Z", // martes 24, 10:00 en Santiago
    title: "Corte",
    customer: { name: "Ana", phone: "+56912345678" },
    ...cambios,
  }
}

const palabrasDe = (rubro: string | null) => vocabularioDe(rubro).palabras
const mensaje = (cambios: Partial<CitaParaRecordar> = {}, resto: { ahora?: Date; zona?: string; sede?: string | null; rubro?: string | null } = {}) =>
  mensajeDeRecordatorio({
    cita: cita(cambios),
    nombreNegocio: "Salón Demo",
    zona: resto.zona ?? SANTIAGO,
    ahora: resto.ahora ?? AHORA,
    sede: resto.sede,
    palabras: palabrasDe(resto.rubro === undefined ? "salon" : resto.rubro),
  })

describe("mensajeDeRecordatorio", () => {
  it("mañana: dice 'mañana' con el día de la semana y el número", () => {
    expect(mensaje()).toBe(
      "Hola Ana, te escribimos de Salón Demo para recordarte tu hora de mañana, martes 24, a las 10:00 (Corte). ¡Te esperamos! Si no puedes venir, avísanos."
    )
  })

  it("hoy: sólo 'de hoy' y la hora", () => {
    expect(mensaje({ startTime: "2026-11-23T19:30:00Z" })).toBe(
      "Hola Ana, te escribimos de Salón Demo para recordarte tu hora de hoy a las 16:30 (Corte). ¡Te esperamos! Si no puedes venir, avísanos."
    )
  })

  it("otro día: el día de la semana, el número y el mes", () => {
    expect(mensaje({ startTime: "2026-11-27T13:00:00Z" })).toContain("tu hora del viernes 27 de noviembre a las 10:00 (Corte).")
    // Cambia de mes y de año: sale del calendario, no de sumar horas.
    expect(mensaje({ startTime: "2027-01-02T13:00:00Z" })).toContain("tu hora del sábado 2 de enero a las 10:00")
  })

  it("el día y la hora son los del negocio, no los de UTC ni los del dispositivo", () => {
    // 02:30 UTC del miércoles 25 es martes 24 a las 23:30 en Santiago: mañana, no pasado mañana.
    expect(mensaje({ startTime: "2026-11-25T02:30:00Z" })).toContain("de mañana, martes 24, a las 23:30")
    // 01:00 UTC del martes 24 todavía es lunes 23 a las 22:00 en Santiago: hoy.
    expect(mensaje({ startTime: "2026-11-24T01:00:00Z" })).toContain("tu hora de hoy a las 22:00")
    // "Hoy" también es el del negocio: a las 02:00 UTC del martes en Santiago sigue siendo lunes.
    expect(mensaje({ startTime: "2026-11-24T13:00:00Z" }, { ahora: new Date("2026-11-24T02:00:00Z") })).toContain("de mañana, martes 24,")
    // El mismo instante, visto desde un negocio en Madrid (UTC+1): ya es martes allá.
    expect(
      mensaje({ startTime: "2026-11-24T13:00:00Z" }, { ahora: new Date("2026-11-24T02:00:00Z"), zona: "Europe/Madrid" })
    ).toContain("tu hora de hoy a las 14:00")
  })

  it("sin servicio no deja paréntesis vacíos", () => {
    expect(mensaje({ title: "  " })).toBe(
      "Hola Ana, te escribimos de Salón Demo para recordarte tu hora de mañana, martes 24, a las 10:00. ¡Te esperamos! Si no puedes venir, avísanos."
    )
  })

  it("varios servicios: como los muestra el título de la cita", () => {
    expect(mensaje({ title: "Corte + Color" })).toContain("a las 10:00 (Corte + Color).")
  })

  it("saluda por el nombre de pila, con sus tildes; sin nombre o sin negocio no deja huecos", () => {
    expect(mensaje({ customer: { name: "  María José ", phone: null } })).toMatch(/^Hola María, te escribimos de Salón Demo /)
    expect(mensaje({ customer: { name: "Íñigo", phone: null } })).toMatch(/^Hola Íñigo, /)
    expect(mensaje({ customer: null })).toMatch(/^Hola, te escribimos de Salón Demo para recordarte/)
    expect(
      mensajeDeRecordatorio({ cita: cita(), nombreNegocio: "  ", zona: SANTIAGO, ahora: AHORA })
    ).toMatch(/^Hola Ana, te escribimos para recordarte tu cita de mañana/)
  })

  it("usa la palabra con que el cliente del rubro llama a su reserva", () => {
    expect(mensaje({}, { rubro: "salon" })).toContain("recordarte tu hora de mañana")
    // En la clínica dental el panel dice "cita", pero el paciente lee "hora".
    expect(mensaje({}, { rubro: "odontologia" })).toContain(
      `recordarte tu ${palabrasDe("odontologia").citaParaElCliente.singular} de mañana`
    )
    expect(mensaje({}, { rubro: null })).toContain("recordarte tu cita de mañana")
  })

  it("con sede dice dónde; sin ella, nada", () => {
    expect(mensaje({}, { sede: " Providencia " })).toContain("(Corte). Dónde: Providencia. ¡Te esperamos!")
    expect(mensaje({}, { sede: null })).not.toContain("Dónde")
  })
})

describe("sePuedeRecordar", () => {
  it("sólo pendiente o confirmada", () => {
    expect(sePuedeRecordar(cita({ status: "pendiente" }), AHORA)).toBe(true)
    expect(sePuedeRecordar(cita({ status: "confirmada" }), AHORA)).toBe(true)
    for (const status of ["cancelada", "completada", "no-asistio", ""]) {
      expect(sePuedeRecordar(cita({ status }), AHORA)).toBe(false)
    }
  })

  it("sólo si todavía no empieza", () => {
    expect(sePuedeRecordar(cita({ startTime: AHORA.toISOString() }), AHORA)).toBe(false)
    expect(sePuedeRecordar(cita({ startTime: "2026-11-23T11:59:00Z" }), AHORA)).toBe(false)
    expect(sePuedeRecordar(cita({ startTime: "2026-11-23T12:01:00Z" }), AHORA)).toBe(true)
    expect(sePuedeRecordar(cita({ startTime: "no es una fecha" }), AHORA)).toBe(false)
  })
})

describe("enlaceDeRecordatorio", () => {
  const enlace = (cambios: Partial<CitaParaRecordar> = {}) =>
    enlaceDeRecordatorio({ cita: cita(cambios), nombreNegocio: "Salón Demo", zona: SANTIAGO, ahora: AHORA, palabras: palabrasDe("salon") })

  it("abre wa.me con el número sin '+' y el mensaje codificado", () => {
    const url = enlace({ title: "Corte & Color #1 + Uñas" })
    expect(url).toMatch(/^https:\/\/wa\.me\/56912345678\?text=/)
    const texto = url!.split("?text=")[1]
    // Nada que corte o cambie el mensaje en la URL: ni espacios, ni &, #, + o tildes sin codificar.
    expect(texto).toMatch(/^[A-Za-z0-9\-_.!~*'()%]+$/)
    expect(texto).not.toMatch(/[&#+ ñáéíóú¡]/)
    expect(decodeURIComponent(texto)).toBe(
      "Hola Ana, te escribimos de Salón Demo para recordarte tu hora de mañana, martes 24, a las 10:00 (Corte & Color #1 + Uñas). ¡Te esperamos! Si no puedes venir, avísanos."
    )
    expect(new URL(url!).searchParams.get("text")).toBe(decodeURIComponent(texto))
  })

  it("sin teléfono, o con uno que no es internacional, no hay enlace", () => {
    for (const phone of [null, "", "912345678", "56912345678", "+56 9 1234 5678", "+0912345678", "+56-9-1234-5678"]) {
      expect(enlace({ customer: { name: "Ana", phone } })).toBeNull()
    }
  })

  it("sin cliente, o si la cita no se puede recordar, no hay enlace", () => {
    expect(enlace({ customer: null })).toBeNull()
    expect(enlace({ status: "cancelada" })).toBeNull()
    expect(enlace({ status: "completada" })).toBeNull()
    expect(enlace({ startTime: "2026-11-23T11:00:00Z" })).toBeNull()
    expect(enlace({ startTime: "no es una fecha" })).toBeNull()
  })
})
