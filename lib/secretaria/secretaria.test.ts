import { randomBytes } from "node:crypto"
import { describe, it, expect, beforeEach } from "vitest"
import { LlaveDeCifradoInvalida, cifrarToken, descifrarToken } from "./cifrado"
import { costoEnMicrodolares, periodoDe, porcentajeGastado } from "./costo"
import { presupuestoDelNegocio } from "./config"

describe("cifrado del token de WhatsApp", () => {
  beforeEach(() => {
    process.env.WHATSAPP_TOKEN_KEY = randomBytes(32).toString("base64")
  })

  it("ida y vuelta, y dos cifrados del mismo token no se parecen", () => {
    const uno = cifrarToken("EAAG-token")
    expect(descifrarToken(uno)).toBe("EAAG-token")
    expect(cifrarToken("EAAG-token")).not.toBe(uno)
    expect(uno).not.toContain("EAAG")
  })

  it("un cifrado alterado no se descifra", () => {
    const [version, iv, tag, datos] = cifrarToken("EAAG-token").split(":")
    const alterado = [version, iv, tag, Buffer.from("otra-cosa").toString("base64")].join(":")
    expect(() => descifrarToken(alterado)).toThrow()
  })

  it("sin llave (o una de otro largo) falla cerrado", () => {
    delete process.env.WHATSAPP_TOKEN_KEY
    expect(() => cifrarToken("x")).toThrow(LlaveDeCifradoInvalida)
    process.env.WHATSAPP_TOKEN_KEY = randomBytes(16).toString("base64")
    expect(() => cifrarToken("x")).toThrow(LlaveDeCifradoInvalida)
  })
})

describe("costo y presupuesto", () => {
  it("un millón de tokens de entrada y uno de salida cuestan lo de la tabla, redondeado hacia arriba", () => {
    expect(costoEnMicrodolares({ entrada: 1_000_000, salida: 0, escrituraDeCache: 0, lecturaDeCache: 0 })).toBe(100_000)
    expect(costoEnMicrodolares({ entrada: 0, salida: 1_000_000, escrituraDeCache: 0, lecturaDeCache: 0 })).toBe(500_000)
    expect(costoEnMicrodolares({ entrada: 1, salida: 0, escrituraDeCache: 0, lecturaDeCache: 0 })).toBe(1)
  })

  it("el porcentaje del presupuesto, y sin presupuesto cuenta como agotado", () => {
    // 500 centavos = US$5 = 5.000.000 microdólares.
    expect(porcentajeGastado(4_000_000, 500)).toBe(80)
    expect(porcentajeGastado(5_000_000, 500)).toBe(100)
    expect(porcentajeGastado(0, 0)).toBe(100)
  })

  it("el mes se cuenta en la zona del negocio", () => {
    // 1 de febrero 02:00 UTC es todavía 31 de enero en Santiago.
    expect(periodoDe(new Date("2030-02-01T02:00:00.000Z"), "America/Santiago")).toBe("2030-01")
    expect(periodoDe(new Date("2030-02-01T02:00:00.000Z"), "UTC")).toBe("2030-02")
  })
})

describe("presupuesto por plan", () => {
  it("Independiente US$3 y Equipo US$9; uno puesto a mano manda; un plan raro recibe el más chico", () => {
    expect(presupuestoDelNegocio("independiente", null)).toBe(300)
    expect(presupuestoDelNegocio("equipo", null)).toBe(900)
    expect(presupuestoDelNegocio("equipo", 2_000)).toBe(2_000)
    expect(presupuestoDelNegocio("equipo", 0)).toBe(0)
    expect(presupuestoDelNegocio("otro", null)).toBe(300)
    expect(presupuestoDelNegocio(undefined, undefined)).toBe(300)
  })
})
