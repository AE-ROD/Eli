import { describe, it, expect } from "vitest"
import { redactarUrlDeAnalitica, antesDeEnviarAnalitica } from "./analitica"

/**
 * Los enlaces de restablecer contraseña y de unirse a un equipo llevan el
 * token en la ruta: mandarlos tal cual a Vercel Analytics deja un token vivo
 * en un servicio de terceros. Se reemplaza por `[token]` antes de enviar.
 */
describe("redactarUrlDeAnalitica", () => {
  it.each([
    ["https://eli.app/restablecer-contrasena/abc123", "https://eli.app/restablecer-contrasena/[token]"],
    ["https://eli.app/unirse/tok_XYZ-9", "https://eli.app/unirse/[token]"],
    ["https://eli.app/unirse/tok/", "https://eli.app/unirse/[token]/"],
    ["https://eli.app/baja-de-correos/dXNy.firma", "https://eli.app/baja-de-correos/[token]"],
    ["https://eli.app/reservar/salon-uno/cita/Ab_9-xyz", "https://eli.app/reservar/salon-uno/cita/[token]"],
    [
      "https://eli.app/restablecer-contrasena/abc?desde=mail#arriba",
      "https://eli.app/restablecer-contrasena/[token]?desde=mail#arriba",
    ],
  ])("%s → %s", (url, esperada) => {
    expect(redactarUrlDeAnalitica(url)).toBe(esperada)
  })

  it.each([
    "https://eli.app/",
    "https://eli.app/dashboard/agenda",
    "https://eli.app/restablecer-contrasena",
    "https://eli.app/recuperar-contrasena",
    "https://eli.app/reservar/mi-negocio",
    "https://eli.app/reservar/mi-negocio?profesional=m-1",
    "https://eli.app/unirse-ahora/algo",
    "https://eli.app/dashboard/unirse/algo",
  ])("no toca otras rutas: %s", (url) => {
    expect(redactarUrlDeAnalitica(url)).toBe(url)
  })

  it("una URL que no se puede leer da null", () => {
    expect(redactarUrlDeAnalitica("no es una url")).toBeNull()
  })
})

describe("antesDeEnviarAnalitica", () => {
  it("redacta la URL del evento y conserva el tipo", () => {
    expect(antesDeEnviarAnalitica({ type: "pageview", url: "https://eli.app/unirse/secreto" })).toEqual({
      type: "pageview",
      url: "https://eli.app/unirse/[token]",
    })
    expect(antesDeEnviarAnalitica({ type: "event", url: "https://eli.app/dashboard" })).toEqual({
      type: "event",
      url: "https://eli.app/dashboard",
    })
  })

  it("una URL que no se puede leer no se envía cruda: descarta el evento", () => {
    expect(antesDeEnviarAnalitica({ type: "pageview", url: "no es una url" })).toBeNull()
  })
})
