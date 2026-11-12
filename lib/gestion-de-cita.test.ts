import { describe, it, expect } from "vitest"
import {
  MENSAJE_ENLACE_INVALIDO,
  dentroDelPlazo,
  esGestionable,
  esTokenConForma,
  hayQueElegirProfesional,
  leerProfesionalDelPedido,
  mensajeEnlaceInvalido,
  mensajeFueraDePlazo,
  mensajeServicioYaNoSeReserva,
  mensajeSinHorasParaReagendar,
  plazoParaQuienReserva,
  profesionalesParaMostrar,
  profesionalesQueSePuedenElegir,
  resolverProfesionalDelEnlace,
  whereDeCitaPorToken,
} from "./gestion-de-cita"
import { generarToken, hashDeToken } from "./tokens"
import { SIN_ATENCION_VIVA } from "./mover-cita"

const AHORA = new Date("2030-01-01T12:00:00.000Z")
const enHoras = (horas: number) => new Date(AHORA.getTime() + horas * 3600_000)

describe("esTokenConForma", () => {
  it("acepta un token de verdad", () => {
    expect(esTokenConForma(generarToken().token)).toBe(true)
  })
  it.each(["", "corto", "con espacios y más texto acá", "a".repeat(101), "../../etc/passwd-aaaaaaaaaaaa"])("rechaza %j", (token) => {
    expect(esTokenConForma(token)).toBe(false)
  })
})

describe("esGestionable", () => {
  it("pendiente o confirmada y todavía no empieza", () => {
    expect(esGestionable({ status: "pendiente", startTime: enHoras(1) }, AHORA)).toBe(true)
    expect(esGestionable({ status: "confirmada", startTime: enHoras(1) }, AHORA)).toBe(true)
  })
  it.each(["cancelada", "completada", "no-asistio", "en-progreso", "raro"])("en estado %s, no", (status) => {
    expect(esGestionable({ status, startTime: enHoras(1) }, AHORA)).toBe(false)
  })
  it("una cita que ya empezó o pasó, no", () => {
    expect(esGestionable({ status: "pendiente", startTime: AHORA }, AHORA)).toBe(false)
    expect(esGestionable({ status: "pendiente", startTime: enHoras(-5) }, AHORA)).toBe(false)
  })
})

describe("dentroDelPlazo", () => {
  it("hasta el plazo justo, sí; después, no", () => {
    expect(dentroDelPlazo(enHoras(24), 24, AHORA)).toBe(true)
    expect(dentroDelPlazo(enHoras(23.9), 24, AHORA)).toBe(false)
  })
  it("con 0 horas, hasta la hora misma", () => {
    expect(dentroDelPlazo(enHoras(0.1), 0, AHORA)).toBe(true)
  })
  it("un plazo fuera de rango se lee como el de por defecto (24)", () => {
    expect(dentroDelPlazo(enHoras(30), 500, AHORA)).toBe(true)
    expect(dentroDelPlazo(enHoras(10), -3, AHORA)).toBe(false)
  })
})

describe("plazoParaQuienReserva (#83)", () => {
  it("dice las horas del plazo", () => {
    expect(plazoParaQuienReserva(24)).toBe("Puedes cancelar o cambiar hasta 24 horas antes.")
    expect(plazoParaQuienReserva(1)).toBe("Puedes cancelar o cambiar hasta 1 hora antes.")
  })
  it("con 0 horas, hasta el momento de la cita", () => {
    expect(plazoParaQuienReserva(0)).toBe("Puedes cancelar o cambiar tu hora hasta el momento de la cita.")
  })
  it("un plazo fuera de rango se dice como el de por defecto, igual que se aplica", () => {
    expect(plazoParaQuienReserva(500)).toBe("Puedes cancelar o cambiar hasta 24 horas antes.")
    expect(plazoParaQuienReserva(-3)).toBe("Puedes cancelar o cambiar hasta 24 horas antes.")
  })
  it("las horas del plazo son horas del reloj: no cambian con el rubro", () => {
    for (const rubro of [undefined, null, "salud", "salon", "odontologia"]) {
      expect(plazoParaQuienReserva(24, rubro)).toBe("Puedes cancelar o cambiar hasta 24 horas antes.")
      expect(plazoParaQuienReserva(1, rubro)).toBe("Puedes cancelar o cambiar hasta 1 hora antes.")
    }
  })
  it("con 0 horas, un rubro con 'hora' no dice 'el momento de la hora': hasta que llegue la hora", () => {
    expect(plazoParaQuienReserva(0, null)).toBe("Puedes cancelar o cambiar tu hora hasta el momento de la cita.")
    for (const rubro of ["salon", "barberia", "spa-de-unas", "odontologia"]) {
      expect(plazoParaQuienReserva(0, rubro)).toBe("Puedes cancelar o cambiar tu hora hasta que llegue la hora.")
    }
  })
})

describe("mensajeFueraDePlazo", () => {
  it("dice el plazo y que se contacte al local", () => {
    expect(mensajeFueraDePlazo(24)).toMatch(/24 horas antes.*Contacta al local/)
  })
  it("sin rubro, o con uno desconocido, es el de siempre", () => {
    expect(mensajeFueraDePlazo(1)).toBe("Ya no se puede cambiar por acá: falta menos de 1 hora. Contacta al local.")
    expect(mensajeFueraDePlazo(24, null)).toBe("Ya no se puede cambiar por acá: se puede hasta 24 horas antes. Contacta al local.")
    expect(mensajeFueraDePlazo(24, "salud")).toBe(mensajeFueraDePlazo(24))
  })
  it("con rubro, nombra al negocio con su artículo", () => {
    expect(mensajeFueraDePlazo(24, "salon")).toMatch(/Contacta al salón\.$/)
    expect(mensajeFueraDePlazo(1, "barberia")).toMatch(/Contacta a la barbería\.$/)
    expect(mensajeFueraDePlazo(24, "odontologia")).toMatch(/Contacta a la clínica\.$/)
  })
})

describe("los mensajes del enlace que nombran el servicio y el lugar", () => {
  it("sin rubro, o con uno desconocido, son los de siempre", () => {
    for (const rubro of [undefined, null, "salud"]) {
      expect(mensajeServicioYaNoSeReserva(rubro)).toBe("Este servicio ya no se reserva por acá. Contacta al local.")
      expect(mensajeSinHorasParaReagendar(rubro)).toBe("No hay horas para reagendar por acá. Contacta al local.")
    }
  })

  it("con rubro, lo que se elige y el lugar salen de su vocabulario", () => {
    expect(mensajeServicioYaNoSeReserva("salon")).toBe("Este servicio ya no se reserva por acá. Contacta al salón.")
    expect(mensajeServicioYaNoSeReserva("odontologia")).toBe("Este motivo ya no se reserva por acá. Contacta a la clínica.")
    expect(mensajeSinHorasParaReagendar("barberia")).toBe("No hay horas para reagendar por acá. Contacta a la barbería.")
  })
})

describe("mensajeEnlaceInvalido: el 404 del enlace con la palabra de la reserva", () => {
  it("sin rubro, o con uno desconocido, es el de siempre", () => {
    expect(MENSAJE_ENLACE_INVALIDO).toBe("Este enlace no es válido o la cita ya no se puede cambiar")
    for (const rubro of [undefined, null, "", "salud", "fitness", "otro", "constructor"]) {
      expect(mensajeEnlaceInvalido(rubro)).toBe(MENSAJE_ENLACE_INVALIDO)
    }
  })

  it("con rubro, la reserva se llama como la lee quien reserva", () => {
    for (const rubro of ["salon", "barberia", "spa-de-unas", "odontologia"]) {
      expect(mensajeEnlaceInvalido(rubro)).toBe("Este enlace no es válido o la hora ya no se puede cambiar")
    }
  })
})

describe("whereDeCitaPorToken", () => {
  it("busca por el hash (nunca el token en claro), el negocio del slug y el estado", () => {
    const { token } = generarToken()
    const where = whereDeCitaPorToken("salon-uno", token)
    expect(where).toEqual({
      manageTokenHash: hashDeToken(token),
      business: { slug: "salon-uno" },
      status: { in: ["pendiente", "confirmada"] },
      // Sin atención viva: con el cliente en el Tablero, gana la llegada.
      AND: [SIN_ATENCION_VIVA],
    })
    expect(JSON.stringify(where)).not.toContain(token)
  })
})

describe("leerProfesionalDelPedido: lo que mandó el navegador, sin creerle", () => {
  it("no mandarlo es 'el mismo'; null o vacío, 'cualquiera'; un texto, ese id sin espacios en las puntas", () => {
    expect(leerProfesionalDelPedido(undefined)).toEqual({ tipo: "mismo" })
    expect(leerProfesionalDelPedido(null)).toEqual({ tipo: "cualquiera" })
    expect(leerProfesionalDelPedido("")).toEqual({ tipo: "cualquiera" })
    expect(leerProfesionalDelPedido("   ")).toEqual({ tipo: "cualquiera" })
    expect(leerProfesionalDelPedido("  m-pedro ")).toEqual({ tipo: "uno", id: "m-pedro" })
  })

  it.each([[123], [true], [{ id: "m-pedro" }], [["m-pedro"]], ["m".repeat(65)]])("%j no es un profesional: null (un 400)", (valor) => {
    expect(leerProfesionalDelPedido(valor)).toBeNull()
  })

  it("64 caracteres todavía pasan", () => {
    expect(leerProfesionalDelPedido("m".repeat(64))).toEqual({ tipo: "uno", id: "m".repeat(64) })
  })
})

describe("quién se puede elegir al reagendar", () => {
  const equipo = [
    { id: "a", nombre: "Ana", especialidad: null, fotoUrl: null, serviceIds: [] },
    { id: "b", nombre: "Beto", especialidad: "Barbero", fotoUrl: null, serviceIds: ["corte"] },
    { id: "c", nombre: "Caro", especialidad: null, fotoUrl: null, serviceIds: ["color"] },
  ]
  const general = (dayOfWeek: number, memberId: string | null = null) => ({ memberId, dayOfWeek, startTime: "09:00", endTime: "12:00" })

  it("hacen TODOS los servicios de la cita (sin filas hacen todos) y tienen algún día con horario, con sus días", () => {
    const filas = [general(1), general(2)]

    expect(profesionalesQueSePuedenElegir(equipo, ["corte"], filas).map((p) => [p.id, p.diasConAtencion])).toEqual([
      ["a", [1, 2]],
      ["b", [1, 2]],
    ])
    // Con dos servicios, sólo quien hace los dos: Beto no hace el color.
    expect(profesionalesQueSePuedenElegir(equipo, ["corte", "color"], filas).map((p) => p.id)).toEqual(["a"])
  })

  it("su propio horario en la sede manda sobre el general; sin ningún horario en la sede, nadie", () => {
    // Ana no cargó horario propio: tiene el general (lunes y martes) y, el miércoles, que sólo hay horario de Beto,
    // el de él (la misma regla de `franjasDeAtencion` con que la disponibilidad le ofrece horas).
    const filas = [general(1), general(2), general(3, "b")]

    expect(profesionalesQueSePuedenElegir(equipo, ["corte"], filas).map((p) => [p.id, p.diasConAtencion])).toEqual([
      ["a", [1, 2, 3]],
      ["b", [3]],
    ])
    expect(profesionalesQueSePuedenElegir(equipo, ["corte"], [])).toEqual([])
  })

  it("una cita sin servicios no tiene a quién ofrecer (`haceLosServicios` exige alguno)", () => {
    expect(profesionalesQueSePuedenElegir(equipo, [], [general(1)])).toEqual([])
  })

  it("hayQueElegirProfesional: con dos o más sí; con uno sólo si es otro que quien la atiende; con ninguno, no", () => {
    expect(hayQueElegirProfesional([{ id: "a" }, { id: "b" }], "a")).toBe(true)
    expect(hayQueElegirProfesional([{ id: "a" }, { id: "b" }], null)).toBe(true)
    expect(hayQueElegirProfesional([{ id: "a" }], "a")).toBe(false)
    expect(hayQueElegirProfesional([{ id: "a" }], null)).toBe(false)
    expect(hayQueElegirProfesional([{ id: "a" }], "b")).toBe(true)
    expect(hayQueElegirProfesional([], "a")).toBe(false)
  })

  it("profesionalesParaMostrar: vacía si no hay nada que elegir; si no, sólo lo público y `actual` en quien la atiende", () => {
    const elegibles = profesionalesQueSePuedenElegir(equipo, ["corte"], [general(1)])

    expect(profesionalesParaMostrar(elegibles, "b")).toEqual([
      { id: "a", nombre: "Ana", especialidad: null, fotoUrl: null, diasConAtencion: [1] },
      { id: "b", nombre: "Beto", especialidad: "Barbero", fotoUrl: null, diasConAtencion: [1], actual: true },
    ])
    expect(profesionalesParaMostrar(elegibles.slice(0, 1), "a")).toEqual([])
    // Nunca el `serviceIds` interno.
    expect(JSON.stringify(profesionalesParaMostrar(elegibles, null))).not.toContain("serviceIds")
  })
})

describe("resolverProfesionalDelEnlace", () => {
  /** La base mínima: dos miembros del negocio (Ana y Beto) y un horario general del lunes. */
  const db = {
    businessMember: {
      findMany: async () => [
        { id: "a", especialidad: null, fotoUrl: null, user: { name: "Ana" }, memberServices: [] },
        { id: "b", especialidad: null, fotoUrl: null, user: { name: "Beto" }, memberServices: [{ serviceId: "color" }] },
      ],
    },
    workSchedule: { findMany: async () => [{ memberId: null, dayOfWeek: 1, startTime: "09:00", endTime: "12:00" }] },
  } as unknown as Parameters<typeof resolverProfesionalDelEnlace>[0]
  const cita = { businessId: "n1", sedeId: null, memberId: "a" }

  it("'el mismo' es quien la atiende hoy (null si no tiene), y 'cualquiera' es nadie en particular: sin leer nada", async () => {
    expect(await resolverProfesionalDelEnlace(db, cita, ["corte"], { tipo: "mismo" })).toEqual({ tipo: "ok", profesionalId: "a" })
    expect(await resolverProfesionalDelEnlace(db, { ...cita, memberId: null }, ["corte"], { tipo: "mismo" })).toEqual({ tipo: "ok", profesionalId: null })
    expect(await resolverProfesionalDelEnlace(db, cita, ["corte"], { tipo: "cualquiera" })).toEqual({ tipo: "ok", profesionalId: null })
  })

  it("un id se revalida: uno que hace el servicio vale; uno que no, o que no existe, es el mismo 'no disponible'", async () => {
    expect(await resolverProfesionalDelEnlace(db, cita, ["color"], { tipo: "uno", id: "b" })).toEqual({ tipo: "ok", profesionalId: "b" })
    expect(await resolverProfesionalDelEnlace(db, cita, ["corte"], { tipo: "uno", id: "b" })).toEqual({ tipo: "no-disponible" })
    expect(await resolverProfesionalDelEnlace(db, cita, ["corte"], { tipo: "uno", id: "de-otro-negocio" })).toEqual({ tipo: "no-disponible" })
  })
})
