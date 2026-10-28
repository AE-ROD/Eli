import { describe, it, expect } from "vitest"
import {
  DIAS_MAXIMOS_DE_ANTICIPACION,
  compartenContacto,
  consentimientoSobreClienteExistente,
  esDiaReservable,
  esElMismoCliente,
  fechaNoReservable,
  normalizarEmail,
  normalizarNombre,
  normalizarTelefono,
  yaPasoLaHora,
} from "./reserva-publica"

/**
 * Esperados a mano, independientes de la zona de la máquina: el 19/10/2026 a
 * las 13:30 UTC son las 10:30 en Santiago (UTC-3) y las 22:30 en Tokio
 * (UTC+9); a las 02:00 UTC del 19 en Santiago todavía es el 18 a las 23:00.
 */
const SANTIAGO = "America/Santiago"
const TOKIO = "Asia/Tokyo"
const LUNES_10_30_SANTIAGO = new Date("2026-10-19T13:30:00.000Z")

describe("DIAS_MAXIMOS_DE_ANTICIPACION", () => {
  it("es 90", () => {
    expect(DIAS_MAXIMOS_DE_ANTICIPACION).toBe(90)
  })
})

describe("fechaNoReservable", () => {
  it.each([
    ["hoy", "2026-10-19", null],
    ["mañana", "2026-10-20", null],
    ["ayer", "2026-10-18", "pasada"],
    ["a 90 días (17/1/2027)", "2027-01-17", null],
    ["a 91 días (18/1/2027)", "2027-01-18", "muy-lejana"],
    ["el último día aceptado como fecha", "9998-12-31", "muy-lejana"],
    ["el primer año aceptado", "1900-01-01", "pasada"],
  ])("%s en Santiago: %s → %s", (_caso, fecha, esperado) => {
    expect(fechaNoReservable(fecha, LUNES_10_30_SANTIAGO, SANTIAGO)).toBe(esperado)
  })

  it("'hoy' es el del negocio: a las 02:00 UTC del 19, en Santiago todavía es el 18", () => {
    const ahora = new Date("2026-10-19T02:00:00.000Z")
    expect(fechaNoReservable("2026-10-18", ahora, SANTIAGO)).toBeNull()
    expect(fechaNoReservable("2026-10-18", ahora, "UTC")).toBe("pasada")
  })
})

describe("esDiaReservable: qué días ofrece el calendario público", () => {
  const TODOS_LOS_DIAS = [0, 1, 2, 3, 4, 5, 6]
  /** Escrito a mano: el 19/10/2026 es lunes. */
  const SOLO_LUNES = [1]

  it.each([
    ["hoy (lunes 19/10/2026)", "2026-10-19", true],
    ["ayer", "2026-10-18", false],
    ["a 90 días (domingo 17/1/2027), el último de la ventana", "2027-01-17", true],
    ["a 91 días (lunes 18/1/2027)", "2027-01-18", false],
    ["a un año", "2027-10-19", false],
  ])("con atención todos los días, %s → %s", (_caso, fecha, esperado) => {
    expect(esDiaReservable(fecha, TODOS_LOS_DIAS, LUNES_10_30_SANTIAGO, SANTIAGO)).toBe(esperado)
  })

  it("sólo los días de la semana con atención", () => {
    expect(esDiaReservable("2026-10-26", SOLO_LUNES, LUNES_10_30_SANTIAGO, SANTIAGO)).toBe(true)
    expect(esDiaReservable("2026-10-20", SOLO_LUNES, LUNES_10_30_SANTIAGO, SANTIAGO)).toBe(false)
  })

  it("'hoy' es el del negocio, no el del navegador: a las 02:00 UTC del 19, en Santiago todavía es el 18", () => {
    const ahora = new Date("2026-10-19T02:00:00.000Z")
    expect(esDiaReservable("2026-10-18", TODOS_LOS_DIAS, ahora, SANTIAGO)).toBe(true)
    expect(esDiaReservable("2026-10-18", TODOS_LOS_DIAS, ahora, "UTC")).toBe(false)
  })

  it.each([["2026-02-30"], ["9999-01-01"], ["no es fecha"]])("una fecha inválida (%s) no se ofrece y no lanza", (fecha) => {
    expect(esDiaReservable(fecha, TODOS_LOS_DIAS, LUNES_10_30_SANTIAGO, SANTIAGO)).toBe(false)
  })
})

describe("yaPasoLaHora", () => {
  it.each([
    ["hoy, antes de ahora", "2026-10-19", "10:00", true],
    ["hoy, la hora en curso", "2026-10-19", "10:30", true],
    ["hoy, un minuto después", "2026-10-19", "10:31", false],
    ["ayer, más tarde que ahora", "2026-10-18", "23:00", true],
    ["mañana, más temprano que ahora", "2026-10-20", "08:00", false],
  ])("%s en Santiago (%s %s) → %s", (_caso, fecha, hora, esperado) => {
    expect(yaPasoLaHora(fecha, hora, LUNES_10_30_SANTIAGO, SANTIAGO)).toBe(esperado)
  })

  it("con el reloj de Tokio, a las 13:30 UTC del 19 ya son las 22:30", () => {
    expect(yaPasoLaHora("2026-10-19", "22:00", LUNES_10_30_SANTIAGO, TOKIO)).toBe(true)
    expect(yaPasoLaHora("2026-10-19", "23:00", LUNES_10_30_SANTIAGO, TOKIO)).toBe(false)
  })
})

describe("normalizarEmail", () => {
  it.each([
    ["  Lucia@Correo.TEST ", "lucia@correo.test"],
    ["lucia@correo.test", "lucia@correo.test"],
    ["", null],
    ["   ", null],
    [null, null],
    [undefined, null],
  ])("%j → %j", (email, esperado) => {
    expect(normalizarEmail(email)).toBe(esperado)
  })
})

describe("normalizarTelefono", () => {
  it.each([
    ["+56 9 1234 5678", "56912345678"],
    ["9 1234-5678", "912345678"],
    ["(2) 2345 6789", "223456789"],
    ["1234567", null],
    ["", null],
    [null, null],
  ])("%j → %j", (telefono, esperado) => {
    expect(normalizarTelefono(telefono)).toBe(esperado)
  })
})

describe("compartenContacto", () => {
  const LUCIA = { email: "Lucia@Correo.test", phone: "+56 9 1234 5678" }

  it.each([
    ["el mismo email, escrito distinto", { email: " lucia@correo.TEST", telefono: undefined }, true],
    ["el mismo teléfono, sin código de país", { email: undefined, telefono: "912345678" }, true],
    ["el mismo teléfono, con otro formato", { email: "otra@correo.test", telefono: "+56912345678" }, true],
    ["otro email y otro teléfono", { email: "otra@correo.test", telefono: "+56 9 8765 4321" }, false],
    ["sin contacto", { email: "", telefono: "" }, false],
    ["un teléfono demasiado corto no identifica", { email: undefined, telefono: "5678" }, false],
  ])("%s → %s", (_caso, contacto, esperado) => {
    expect(compartenContacto(LUCIA, contacto)).toBe(esperado)
  })

  it("un cliente sin email ni teléfono no comparte contacto con nadie", () => {
    expect(compartenContacto({ email: null, phone: null }, { email: "", telefono: "" })).toBe(false)
  })
})

describe("normalizarNombre", () => {
  it.each([
    ["  LUCÍA   Pérez ", "lucia perez"],
    ["Güemes Muñoz", "guemes munoz"],
    ["", ""],
    [null, ""],
  ])("%j → %j", (nombre, esperado) => {
    expect(normalizarNombre(nombre)).toBe(esperado)
  })
})

describe("esElMismoCliente", () => {
  const LUCIA = { name: "Lucía", lastName: "Pérez", email: "Lucia@Correo.test" }

  it.each([
    ["el mismo email y nombre, escritos distinto", { nombre: "LUCIA", apellido: "perez", email: " lucia@correo.TEST " }, true],
    ["el mismo email con otro nombre", { nombre: "Marta", apellido: "Rojas", email: "lucia@correo.test" }, false],
    ["el mismo nombre con otro email", { nombre: "Lucía", apellido: "Pérez", email: "otra@correo.test" }, false],
    ["el mismo nombre sin email", { nombre: "Lucía", apellido: "Pérez", email: "" }, false],
    ["el mismo nombre de pila con otro apellido", { nombre: "Lucía", apellido: "Rojas", email: "lucia@correo.test" }, false],
  ])("%s → %s", (_caso, reserva, esperado) => {
    expect(esElMismoCliente(LUCIA, reserva)).toBe(esperado)
  })

  it("un cliente sin email nunca es el mismo", () => {
    expect(esElMismoCliente({ ...LUCIA, email: null }, { nombre: "Lucía", apellido: "Pérez", email: "" })).toBe(false)
  })

  it("un cliente sin apellido sólo coincide si la reserva trae el nombre completo igual", () => {
    const sinApellido = { name: "Lucía Pérez", lastName: null, email: "lucia@correo.test" }
    expect(esElMismoCliente(sinApellido, { nombre: "Lucia", apellido: "Perez", email: "lucia@correo.test" })).toBe(true)
  })
})

describe("consentimientoSobreClienteExistente", () => {
  it("sin teléfono en la reserva: nada", () => {
    expect(consentimientoSobreClienteExistente("+56912345678", null)).toBe("nada")
    expect(consentimientoSobreClienteExistente(null, undefined)).toBe("nada")
  })

  it("el cliente no tiene teléfono (null o en blanco): se guarda el dado", () => {
    expect(consentimientoSobreClienteExistente(null, "+56912345678")).toBe("guardar-telefono")
    expect(consentimientoSobreClienteExistente("", "+56912345678")).toBe("guardar-telefono")
    expect(consentimientoSobreClienteExistente("   ", "+56912345678")).toBe("guardar-telefono")
  })

  it("el mismo número, escrito de otra forma: se registra", () => {
    expect(consentimientoSobreClienteExistente("9 1234 5678", "+56912345678")).toBe("registrar")
    expect(consentimientoSobreClienteExistente("+56912345678", "+56912345678")).toBe("registrar")
  })

  it("otro número o uno ilegible guardado: nada (no se pisa)", () => {
    expect(consentimientoSobreClienteExistente("+56987654321", "+56912345678")).toBe("nada")
    expect(consentimientoSobreClienteExistente("+1 415 555 0100", "+56912345678")).toBe("nada")
    expect(consentimientoSobreClienteExistente("hola", "+56912345678")).toBe("nada")
  })
})
