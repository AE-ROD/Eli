import { describe, expect, it } from "vitest"
import {
  ACCEPT_DE_FOTO,
  MAXIMO_DE_ENTRADA_EN_BYTES,
  OBJETIVO_A_ENVIAR_EN_BYTES,
  dimensionesDestino,
  intentosDeCompresion,
  ladoMaximoDe,
  validarFotoDeEntrada,
} from "./ajustar-foto-en-cliente"

describe("dimensionesDestino", () => {
  it("achica una foto horizontal conservando la proporción: el lado largo queda en el máximo", () => {
    expect(dimensionesDestino(4000, 3000, 800)).toEqual({ ancho: 800, alto: 600 })
  })

  it("achica una foto vertical (la del celular) por el alto", () => {
    expect(dimensionesDestino(3000, 4000, 800)).toEqual({ ancho: 600, alto: 800 })
  })

  it("una foto cuadrada queda cuadrada", () => {
    expect(dimensionesDestino(2000, 2000, 800)).toEqual({ ancho: 800, alto: 800 })
  })

  it("nunca agranda: una foto más chica que el máximo queda como está", () => {
    expect(dimensionesDestino(400, 300, 800)).toEqual({ ancho: 400, alto: 300 })
    expect(dimensionesDestino(800, 800, 800)).toEqual({ ancho: 800, alto: 800 })
  })

  it("redondea al píxel entero y el lado largo nunca pasa del máximo", () => {
    const resultado = dimensionesDestino(4001, 3001, 800)
    expect(resultado).not.toBeNull()
    expect(Number.isInteger(resultado!.ancho)).toBe(true)
    expect(Number.isInteger(resultado!.alto)).toBe(true)
    expect(resultado!.ancho).toBe(800)
    expect(resultado!.alto).toBe(600)
  })

  it("una tira muy larga no deja un lado en cero", () => {
    expect(dimensionesDestino(10000, 10, 800)).toEqual({ ancho: 800, alto: 1 })
  })

  it("sin tamaño real (cero, negativo, NaN, infinito) no hay dimensiones", () => {
    expect(dimensionesDestino(0, 100, 800)).toBeNull()
    expect(dimensionesDestino(100, -5, 800)).toBeNull()
    expect(dimensionesDestino(Number.NaN, 100, 800)).toBeNull()
    expect(dimensionesDestino(Infinity, 100, 800)).toBeNull()
    expect(dimensionesDestino(100, 100, 0)).toBeNull()
  })
})

describe("ladoMaximoDe", () => {
  it("la portada conserva más lado que un círculo", () => {
    expect(ladoMaximoDe("circulo")).toBe(800)
    expect(ladoMaximoDe("banner")).toBe(1600)
  })
})

describe("validarFotoDeEntrada", () => {
  it.each(["image/jpeg", "image/png", "image/webp", "IMAGE/JPEG"])("acepta %s", (type) => {
    expect(validarFotoDeEntrada({ type, size: 3 * 1024 * 1024 })).toEqual({ ok: true })
  })

  it("rechaza lo que no es una imagen de los tres formatos, con un mensaje en español", () => {
    for (const type of ["application/pdf", "image/gif", "image/svg+xml", "text/plain", ""]) {
      const resultado = validarFotoDeEntrada({ type, size: 1000 })
      expect(resultado).toEqual({ ok: false, error: "Elige una foto en formato JPG, PNG o WebP." })
    }
  })

  it("HEIC (la cámara del iPhone) tiene su propio mensaje", () => {
    const resultado = validarFotoDeEntrada({ type: "image/heic", size: 1000 })
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) expect(resultado.error).toMatch(/HEIC/)
  })

  it("rechaza el archivo vacío", () => {
    expect(validarFotoDeEntrada({ type: "image/png", size: 0 }).ok).toBe(false)
  })

  it("acepta justo el máximo y rechaza un byte más, diciendo cuántos MB", () => {
    expect(validarFotoDeEntrada({ type: "image/jpeg", size: MAXIMO_DE_ENTRADA_EN_BYTES })).toEqual({ ok: true })
    expect(validarFotoDeEntrada({ type: "image/jpeg", size: MAXIMO_DE_ENTRADA_EN_BYTES + 1 })).toEqual({
      ok: false,
      error: "La foto pesa más de 15 MB. Elige una más liviana.",
    })
  })
})

describe("ACCEPT_DE_FOTO", () => {
  it("lista los tres tipos que acepta el servidor", () => {
    expect(ACCEPT_DE_FOTO).toBe("image/jpeg,image/png,image/webp")
  })
})

describe("intentosDeCompresion", () => {
  it("empieza por la mejor calidad en el lado máximo y sólo después comprime más", () => {
    const intentos = intentosDeCompresion(800)
    expect(intentos[0]).toEqual({ lado: 800, calidad: 0.85 })
    for (let i = 1; i < intentos.length; i++) {
      const anterior = intentos[i - 1]
      expect(intentos[i].lado).toBeLessThanOrEqual(anterior.lado)
      expect(intentos[i].lado < anterior.lado || intentos[i].calidad < anterior.calidad).toBe(true)
    }
  })

  it("nunca pasa del lado máximo ni de una calidad válida", () => {
    for (const intento of intentosDeCompresion(1600)) {
      expect(intento.lado).toBeLessThanOrEqual(1600)
      expect(intento.lado).toBeGreaterThan(0)
      expect(intento.calidad).toBeGreaterThan(0)
      expect(intento.calidad).toBeLessThanOrEqual(1)
    }
  })

  it("el objetivo es de 1,5 MB", () => {
    expect(OBJETIVO_A_ENVIAR_EN_BYTES).toBe(1.5 * 1024 * 1024)
  })
})
