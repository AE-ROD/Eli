import { describe, it, expect } from "vitest"
import {
  DIAS_MAXIMOS_DE_ANTICIPACION,
  compartenContacto,
  diasDelCalendarioDeReserva,
  elDiaElegidoQuedoSinAtencion,
  esDiaReservable,
  esElMismoCliente,
  fechaNoReservable,
  normalizarEmail,
  normalizarNombre,
  normalizarTelefono,
  notaDeContactoPorConfirmar,
  yaPasoLaHora,
  avisoSinCambiosPorElEnlace,
  avisoSinCambiosDespuesDeReservar,
  quedaSinCambiosPorElEnlace,
} from "./reserva-publica"
import { dentroDelPlazo } from "./gestion-de-cita"
import { instanteEn } from "./zona-horaria"

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

describe("notaDeContactoPorConfirmar (#109, #115)", () => {
  it("sin teléfono en la reserva: nada que anotar", () => {
    expect(notaDeContactoPorConfirmar(null, null, true)).toBeNull()
    expect(notaDeContactoPorConfirmar("+56912345678", undefined, false)).toBeNull()
  })

  it("el mismo número, sin pedir WhatsApp: nada que anotar", () => {
    expect(notaDeContactoPorConfirmar("9 1234 5678", "+56912345678", false)).toBeNull()
  })

  it("el cliente no tiene teléfono (null o en blanco), otro o uno ilegible: se anota el número", () => {
    for (const guardado of [null, "", "   ", "+56987654321", "llamar al local"]) {
      const nota = notaDeContactoPorConfirmar(guardado, "+56912345678", false)
      expect(nota).toContain("+56912345678")
      expect(nota).not.toContain("WhatsApp")
    }
  })

  it("pidió WhatsApp: se anota, con el número sólo si no es el guardado", () => {
    const mismo = notaDeContactoPorConfirmar("+56912345678", "+56912345678", true)
    expect(mismo).toContain("WhatsApp")
    expect(mismo).not.toContain("+56912345678")
    const otro = notaDeContactoPorConfirmar(null, "+56912345678", true)
    expect(otro).toContain("WhatsApp")
    expect(otro).toContain("+56912345678")
  })
})

describe("quedaSinCambiosPorElEnlace (QA#8)", () => {
  // 2030-01-07 12:00 UTC son las 09:00 en Santiago (UTC-3 en enero).
  const AHORA_QA8 = new Date("2030-01-07T12:00:00.000Z")
  const ZONA = "America/Santiago"

  it("una hora a menos del plazo ya no se puede cancelar ni cambiar por el enlace", () => {
    expect(quedaSinCambiosPorElEnlace("2030-01-07", "18:00", ZONA, 24, AHORA_QA8)).toBe(true)
    expect(quedaSinCambiosPorElEnlace("2030-01-08", "08:59", ZONA, 24, AHORA_QA8)).toBe(true)
  })

  it("justo en el plazo o más allá, sí (la misma regla que dentroDelPlazo)", () => {
    expect(quedaSinCambiosPorElEnlace("2030-01-08", "09:00", ZONA, 24, AHORA_QA8)).toBe(false)
    expect(dentroDelPlazo(instanteEn("2030-01-08", "09:00", ZONA), 24, AHORA_QA8)).toBe(true)
    expect(dentroDelPlazo(instanteEn("2030-01-08", "08:59", ZONA), 24, AHORA_QA8)).toBe(false)
  })

  it("con plazo 0 nunca avisa; sin hora elegida o inválida, tampoco", () => {
    expect(quedaSinCambiosPorElEnlace("2030-01-07", "09:30", ZONA, 0, AHORA_QA8)).toBe(false)
    expect(quedaSinCambiosPorElEnlace("2030-01-07", "", ZONA, 24, AHORA_QA8)).toBe(false)
    expect(quedaSinCambiosPorElEnlace("", "10:00", ZONA, 24, AHORA_QA8)).toBe(false)
  })

  it("el aviso dice el plazo y que no se podrá cancelar ni cambiar", () => {
    expect(avisoSinCambiosPorElEnlace(24)).toMatch(/menos de 24 horas.*no podrás cancelarla ni cambiarla/)
    expect(avisoSinCambiosPorElEnlace(1)).toMatch(/menos de 1 hora:/)
  })
})

describe("avisoSinCambiosDespuesDeReservar (QA#8)", () => {
  it("dice el plazo y que se contacte al local", () => {
    expect(avisoSinCambiosDespuesDeReservar(24)).toBe(
      "Tu hora es en menos de 24 horas, así que no se puede cancelar ni cambiar por el enlace. Si lo necesitas, contacta directamente al local."
    )
  })
})

describe("diasDelCalendarioDeReserva (N3): el calendario sólo deja elegir días con atención", () => {
  // El negocio publica L–M–X (sólo Carla atiende, con su horario propio).
  const diasPublicados = [1, 2, 3]
  const carla = { id: "m-carla", servicioIds: null, diasConAtencion: [1, 2, 3] }
  const pedro = { id: "m-pedro", servicioIds: ["s-color"], diasConAtencion: [4, 5] }

  it("con una sola profesional, sus días: ni viernes ni sábado", () => {
    expect(diasDelCalendarioDeReserva({ diasPublicados, equipo: [carla], servicioIds: ["s-corte"], profesionalId: null })).toEqual([1, 2, 3])
  })

  it("con cualquiera, la unión de los que hacen todos los servicios elegidos", () => {
    expect(diasDelCalendarioDeReserva({ diasPublicados, equipo: [carla, pedro], servicioIds: ["s-color"], profesionalId: null })).toEqual([1, 2, 3, 4, 5])
    // Pedro no hace el corte: sus días no cuentan.
    expect(diasDelCalendarioDeReserva({ diasPublicados, equipo: [carla, pedro], servicioIds: ["s-corte"], profesionalId: null })).toEqual([1, 2, 3])
    expect(diasDelCalendarioDeReserva({ diasPublicados, equipo: [carla, pedro], servicioIds: ["s-color", "s-corte"], profesionalId: null })).toEqual([1, 2, 3])
  })

  it("con un profesional elegido, sólo los suyos", () => {
    expect(diasDelCalendarioDeReserva({ diasPublicados, equipo: [carla, pedro], servicioIds: ["s-color"], profesionalId: "m-pedro" })).toEqual([4, 5])
  })

  it("si nadie hace los servicios, ningún día (la reserva tampoco ofrecería horas)", () => {
    expect(diasDelCalendarioDeReserva({ diasPublicados, equipo: [pedro], servicioIds: ["s-corte"], profesionalId: null })).toEqual([])
  })

  it("sin equipo leído o sin profesionales, los días del horario publicado", () => {
    expect(diasDelCalendarioDeReserva({ diasPublicados: [1, 1, 6], equipo: null, servicioIds: ["s-corte"], profesionalId: null })).toEqual([1, 6])
    expect(diasDelCalendarioDeReserva({ diasPublicados: [1, 6], equipo: [], servicioIds: ["s-corte"], profesionalId: null })).toEqual([1, 6])
  })
})

describe("elDiaElegidoQuedoSinAtencion: al cambiar de profesional o servicios, el día elegido se limpia si ya no tiene atención", () => {
  // El 6 de noviembre de 2026 es viernes; el 2, lunes.
  it("un viernes elegido con 'cualquiera' se limpia al elegir a Carla, que atiende L–M–X", () => {
    expect(elDiaElegidoQuedoSinAtencion("2026-11-06", [1, 2, 3])).toBe(true)
  })

  it("un día que sigue con atención no se toca", () => {
    expect(elDiaElegidoQuedoSinAtencion("2026-11-02", [1, 2, 3])).toBe(false)
  })

  it("sin día elegido, o con uno inválido, no hay nada que limpiar", () => {
    expect(elDiaElegidoQuedoSinAtencion("", [1])).toBe(false)
    expect(elDiaElegidoQuedoSinAtencion("2026-13-40", [1])).toBe(false)
  })
})
