import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { contactoDelNegocio, hayContacto } from "../_contacto"
import { ContactarAlNegocio, DireccionYComoLlegar } from "./contactar-al-negocio"
import { GuardarEnlace, enlaceCompleto, enlaceParaMandarPorWhatsapp } from "./guardar-enlace"

/*
 * Contactar al negocio, cómo llegar y guardar un enlace: lo que reemplaza a
 * "contacta directamente al local" y a "Guarda este enlace" a secas.
 */

describe("el contacto público del negocio", () => {
  it("con su WhatsApp: el chat y el número para llamar", () => {
    expect(contactoDelNegocio("9 1234 5678")).toEqual({
      whatsapp: "https://wa.me/56912345678",
      telefono: "+56912345678",
    })
  })

  it("sin número, o ilegible: nada que ofrecer", () => {
    expect(hayContacto(contactoDelNegocio(null))).toBe(false)
    expect(hayContacto(contactoDelNegocio("hola"))).toBe(false)
    expect(hayContacto(null)).toBe(false)
  })

  it("los botones dicen qué hacen y a quién, y no pintan nada sin datos", () => {
    const html = renderToString(
      createElement(ContactarAlNegocio, { contacto: contactoDelNegocio("+56912345678"), nombreDelNegocio: "Salón Uno" })
    )
    expect(html).toContain("Escribir por WhatsApp")
    expect(html).toContain('href="https://wa.me/56912345678"')
    expect(html).toContain("Llamar")
    expect(html).toContain('href="tel:+56912345678"')
    expect(html).toContain('aria-label="Llamar a Salón Uno"')
    expect(
      renderToString(createElement(ContactarAlNegocio, { contacto: contactoDelNegocio(null), nombreDelNegocio: "X" }))
    ).toBe("")
  })
})

describe("cómo llegar sin sede", () => {
  it("la dirección y Google Maps", () => {
    const html = renderToString(createElement(DireccionYComoLlegar, { direccion: "Av. Italia 1234", comuna: "Providencia" }))
    expect(html).toContain("Av. Italia 1234, Providencia")
    expect(html).toContain("Cómo llegar")
    expect(html).toContain("https://www.google.com/maps/search/?api=1&amp;query=Av.%20Italia%201234%2C%20Providencia")
  })

  it("sin calle, nada: la comuna sola no lleva al local", () => {
    expect(renderToString(createElement(DireccionYComoLlegar, { direccion: null, comuna: "Providencia" }))).toBe("")
  })
})

describe("guardar un enlace", () => {
  it("WhatsApp sin destinatario, con el texto codificado entero", () => {
    expect(enlaceParaMandarPorWhatsapp("Mi hora en Salón Uno: https://x.test/a?b=1&c=2")).toBe(
      "https://wa.me/?text=Mi%20hora%20en%20Sal%C3%B3n%20Uno%3A%20https%3A%2F%2Fx.test%2Fa%3Fb%3D1%26c%3D2"
    )
  })

  it("el enlace completo con el origen de la página; sin origen, la ruta", () => {
    expect(enlaceCompleto("/reservar/uno/cita/abc", "https://eli.test")).toBe("https://eli.test/reservar/uno/cita/abc")
    expect(enlaceCompleto("/reservar/uno/cita/abc", "")).toBe("/reservar/uno/cita/abc")
  })

  it("los dos botones y el enlace escrito, para copiarlo a mano", () => {
    const html = renderToString(
      createElement(GuardarEnlace, { ruta: "/fila/uno/abc", mensaje: (enlace: string) => `Mi turno: ${enlace}` })
    )
    expect(html).toContain("Copiar enlace")
    expect(html).toContain("Enviármelo por WhatsApp")
    expect(html).toContain("/fila/uno/abc")
    expect(html).toContain('role="status"')
  })
})
