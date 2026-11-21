import { describe, it, expect } from "vitest"
import { contenidoDelMensaje, esChatUnoAUno, esReciente, pausaAntesDeEnviar, telefonoDelJid } from "./entrantes"

describe("qué llega por WhatsApp", () => {
  it("sólo chats uno a uno", () => {
    expect(esChatUnoAUno("56911111111@s.whatsapp.net")).toBe(true)
    expect(esChatUnoAUno("123456789@lid")).toBe(true)
    for (const jid of ["120363@g.us", "status@broadcast", "123@broadcast", "1203@newsletter", "", null, undefined]) {
      expect(esChatUnoAUno(jid)).toBe(false)
    }
  })

  it("el teléfono sale de un número, no de un id privado ni de un dispositivo raro", () => {
    expect(telefonoDelJid("56911111111@s.whatsapp.net")).toBe("+56911111111")
    expect(telefonoDelJid("123456789@lid")).toBeNull()
    expect(telefonoDelJid("12@s.whatsapp.net")).toBeNull()
    expect(telefonoDelJid(null)).toBeNull()
  })

  it("texto, otra cosa o algo del sistema", () => {
    expect(contenidoDelMensaje({ conversation: "hola" })).toEqual({ tipo: "texto", texto: "hola" })
    expect(contenidoDelMensaje({ extendedTextMessage: { text: "con link" } })).toEqual({ tipo: "texto", texto: "con link" })
    expect(contenidoDelMensaje({ ephemeralMessage: { message: { conversation: "temporal" } } })).toEqual({ tipo: "texto", texto: "temporal" })
    expect(contenidoDelMensaje({ imageMessage: { caption: "foto" } })).toEqual({ tipo: "otro" })
    expect(contenidoDelMensaje({ audioMessage: {} })).toEqual({ tipo: "otro" })
    expect(contenidoDelMensaje({ reactionMessage: { text: "👍" } })).toEqual({ tipo: "ignorar" })
    expect(contenidoDelMensaje({ protocolMessage: {} })).toEqual({ tipo: "ignorar" })
    expect(contenidoDelMensaje(null)).toEqual({ tipo: "ignorar" })
  })

  it("reciente: hasta 10 minutos", () => {
    const ahora = new Date("2030-01-06T15:00:00Z")
    const segundos = ahora.getTime() / 1000
    expect(esReciente(segundos - 9 * 60, ahora)).toBe(true)
    expect(esReciente(segundos - 11 * 60, ahora)).toBe(false)
    expect(esReciente({ toString: () => String(segundos) }, ahora)).toBe(true)
  })

  it("la pausa de \"escribiendo…\" va entre 1,5 y 7 segundos", () => {
    expect(pausaAntesDeEnviar("ok")).toBe(1_500)
    expect(pausaAntesDeEnviar("x".repeat(1000))).toBe(7_000)
  })
})
