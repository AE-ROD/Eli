import { describe, it, expect } from "vitest"
import {
  dentroDelPlazo,
  esGestionable,
  esTokenConForma,
  mensajeFueraDePlazo,
  plazoParaQuienReserva,
  whereDeCitaPorToken,
} from "./gestion-de-cita"
import { generarToken, hashDeToken } from "./tokens"

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
})

describe("mensajeFueraDePlazo", () => {
  it("dice el plazo y que se contacte al local", () => {
    expect(mensajeFueraDePlazo(24)).toMatch(/24 horas antes.*Contacta al local/)
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
    })
    expect(JSON.stringify(where)).not.toContain(token)
  })
})
