import { describe, it, expect } from "vitest"
import { asuntoSugerido, dias, enlaceDeCorreo, enlaceDeWhatsapp, fechaParaLeer, mensajeSugerido } from "./_escribirle"

describe("mensajeSugerido", () => {
  it("saluda por el primer nombre, dice de dónde le escriben y propone su último servicio", () => {
    expect(mensajeSugerido({ nombre: "María José", nombreNegocio: "Salón Uno", ultimoServicio: "Corte" })).toBe(
      "¡Hola, María! Te escribimos de Salón Uno. Hace un tiempo que no te vemos y queríamos saber cómo estás. ¿Te reservamos una hora para tu próximo corte?"
    )
  })

  it("sin servicio ni negocio, igual se lee bien", () => {
    expect(mensajeSugerido({ nombre: "  ", nombreNegocio: "", ultimoServicio: null })).toBe(
      "¡Hola! Hace un tiempo que no te vemos y queríamos saber cómo estás. ¿Te reservamos una hora?"
    )
  })

  it("asunto con el negocio", () => {
    expect(asuntoSugerido("Salón Uno")).toBe("Te extrañamos en Salón Uno")
    expect(asuntoSugerido("")).toBe("Te extrañamos")
  })
})

describe("enlaceDeWhatsapp", () => {
  it("wa.me con el número sólo en dígitos y el mensaje codificado", () => {
    expect(enlaceDeWhatsapp("+56987654321", "¡Hola! ¿Cómo estás? & más")).toBe(
      "https://wa.me/56987654321?text=%C2%A1Hola!%20%C2%BFC%C3%B3mo%20est%C3%A1s%3F%20%26%20m%C3%A1s"
    )
  })

  it("sin teléfono o con uno que no es E.164, no hay enlace", () => {
    for (const telefono of [null, "", "987654321", "+56 9 8765 4321", "+0123456789", "+56abc"]) {
      expect(enlaceDeWhatsapp(telefono, "hola")).toBeNull()
    }
  })
})

describe("enlaceDeCorreo", () => {
  it("mailto con asunto y cuerpo codificados", () => {
    expect(enlaceDeCorreo("maria@test.cl", "Te extrañamos", "Hola & chao")).toBe(
      "mailto:maria@test.cl?subject=Te%20extra%C3%B1amos&body=Hola%20%26%20chao"
    )
  })

  it("un correo que podría colar parámetros no da enlace", () => {
    for (const email of [null, "", "sin-arroba", "a@b.cl?bcc=otro@x.cl", "a b@c.cl"]) {
      expect(enlaceDeCorreo(email, "a", "b")).toBeNull()
    }
  })
})

describe("textos", () => {
  it("días y fechas", () => {
    expect(dias(1)).toBe("1 día")
    expect(dias(42)).toBe("42 días")
    expect(fechaParaLeer("2026-11-11")).toBe("11 de noviembre")
  })
})
