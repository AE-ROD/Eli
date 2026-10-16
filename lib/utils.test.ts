import { describe, it, expect } from "vitest"
import { cn } from "./utils"

describe("cn", () => {
  it("combina clases simples", () => {
    expect(cn("px-2", "py-4")).toBe("px-2 py-4")
  })

  it("ignora valores falsy", () => {
    expect(cn("px-2", false, null, undefined, "py-4")).toBe("px-2 py-4")
  })

  it("resuelve conflictos de Tailwind quedándose con la última clase", () => {
    expect(cn("px-2", "px-4")).toBe("px-4")
  })

  describe("con los tokens propios de app/globals.css", () => {
    it.each([
      ["rounded-tarjeta", "rounded-[24px]", "rounded-[24px]"],
      ["rounded-[24px]", "rounded-tarjeta", "rounded-tarjeta"],
      ["rounded-boton", "rounded-full", "rounded-full"],
      ["rounded-boton-lg", "rounded-campo", "rounded-campo"],
      ["rounded-seccion", "rounded-panel", "rounded-panel"],
      ["rounded-boton", "rounded-md", "rounded-md"],
    ])("un radio propio choca con otro radio: %s + %s deja %s", (antes, despues, queda) => {
      expect(cn(antes, despues)).toBe(queda)
    })

    it("un radio de una sola esquina no pisa el radio entero", () => {
      expect(cn("rounded-tarjeta", "rounded-t-none")).toBe("rounded-tarjeta rounded-t-none")
    })

    it("con distinta variante, las dos se quedan", () => {
      expect(cn("rounded-panel", "md:rounded-tarjeta")).toBe("rounded-panel md:rounded-tarjeta")
    })

    it("las curvas propias chocan entre sí y con las de Tailwind", () => {
      expect(cn("ease-suave", "ease-fundido")).toBe("ease-fundido")
      expect(cn("ease-fundido", "ease-in-out")).toBe("ease-in-out")
    })

    it("la animación del brillo choca con otra animación", () => {
      expect(cn("animate-brillo", "animate-none")).toBe("animate-none")
    })

    it("los colores y las sombras propios ya se resolvían", () => {
      expect(cn("bg-crema", "bg-navy")).toBe("bg-navy")
      expect(cn("text-texto-2", "text-white/70")).toBe("text-white/70")
      expect(cn("shadow-sm", "shadow-md")).toBe("shadow-md")
    })

    it("el tamaño de letra y el color no se confunden aunque los dos empiecen con text-", () => {
      expect(cn("text-base", "text-texto-2")).toBe("text-base text-texto-2")
    })
  })
})
