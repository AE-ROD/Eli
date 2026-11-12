import { describe, it, expect } from "vitest"
import {
  MENSAJE_ENLACE_INVALIDO,
  dentroDelPlazo,
  esGestionable,
  esTokenConForma,
  mensajeEnlaceInvalido,
  mensajeFueraDePlazo,
  mensajeServicioYaNoSeReserva,
  mensajeSinHorasParaReagendar,
  plazoParaQuienReserva,
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
