import { describe, it, expect } from "vitest"
import { generarSlug } from "./slug"

describe("generarSlug", () => {
  it("pasa a minúsculas y reemplaza espacios por guiones", () => {
    expect(generarSlug("Salón de Belleza")).toBe("salon-de-belleza")
  })

  it("quita tildes y diacríticos", () => {
    expect(generarSlug("Peluquería Ñañez")).toBe("peluqueria-nanez")
  })

  it("elimina caracteres que no son alfanuméricos ni guiones", () => {
    expect(generarSlug("Spa & Wellness!! (Centro)")).toBe("spa-wellness-centro")
  })

  it("recorta espacios al inicio y al final", () => {
    expect(generarSlug("  Mi Negocio  ")).toBe("mi-negocio")
  })

  it("trunca a 50 caracteres", () => {
    const nombreLargo = "a".repeat(80)
    expect(generarSlug(nombreLargo)).toHaveLength(50)
  })
})
