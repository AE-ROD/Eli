import { describe, it, expect } from "vitest"
import { generarSlug, slugDelNombre } from "./slug"

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

describe("slugDelNombre", () => {
  it("usa el slug del nombre cuando tiene algo que sirva en una URL", () => {
    expect(slugDelNombre("Salón Ñuñoa")).toBe("salon-nunoa")
  })

  it.each(["💇‍♀️✨", "!!!", "---", "Салон", "   "])("un nombre sin letras ni números latinos (%s) da un slug de respaldo, nunca vacío", (nombre) => {
    expect(slugDelNombre(nombre)).toMatch(/^negocio-[0-9a-f]{6}$/)
  })
})
