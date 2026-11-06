import { describe, it, expect } from "vitest"
import { aE164Chile } from "@/lib/telefono"
import { clasificar, leerOpciones, resumen } from "./normalizar-telefonos"

describe("normalizar-telefonos: opciones", () => {
  it("sin argumentos simula sobre todos los negocios", () => {
    expect(leerOpciones([])).toEqual({ aplicar: false, negocio: null })
    expect(leerOpciones(["--simular"])).toEqual({ aplicar: false, negocio: null })
  })

  it("--aplicar escribe; --negocio acota, con espacio o con =", () => {
    expect(leerOpciones(["--aplicar"])).toEqual({ aplicar: true, negocio: null })
    expect(leerOpciones(["--negocio", "neg-1"])).toEqual({ aplicar: false, negocio: "neg-1" })
    expect(leerOpciones(["--aplicar", "--negocio=neg-1"])).toEqual({ aplicar: true, negocio: "neg-1" })
  })

  it.each([
    [["--simular", "--aplicar"]],
    [["--negocio"]],
    [["--negocio", "--aplicar"]],
    [["--negocio="]],
    [["--aplicr"]],
    [["neg-1"]],
  ])("rechaza %j en vez de adivinar", (argumentos) => {
    expect(leerOpciones(argumentos)).toHaveProperty("error")
  })
})

describe("normalizar-telefonos: clasificar", () => {
  it("normaliza lo que se puede leer, deja lo que ya está y cuenta lo ilegible y lo vacío", () => {
    const resultado = clasificar(
      [
        { id: "a", phone: "9 1234 5678" },
        { id: "b", phone: "+56912345678" },
        { id: "c", phone: "1234 5678" }, // 8 dígitos de antes de 2016: no se adivina
        { id: "d", phone: "+54 11 1234 5678" }, // extranjero
        { id: "e", phone: "   " },
        { id: "f", phone: null },
        { id: "g", phone: "(2) 2345 6789" },
        { id: "h", phone: "+56 9 1234 5678" },
      ],
      aE164Chile
    )

    expect(resultado.cambios).toEqual([
      { id: "a", anterior: "9 1234 5678", nuevo: "+56912345678" },
      { id: "g", anterior: "(2) 2345 6789", nuevo: "+56223456789" },
      { id: "h", anterior: "+56 9 1234 5678", nuevo: "+56912345678" },
    ])
    expect(resultado).toMatchObject({ yaNormalizados: 1, ilegibles: 2, vacios: 2 })
  })

  it("guarda el teléfono anterior tal cual, con sus espacios, para escribir sólo si nadie lo cambió", () => {
    const { cambios } = clasificar([{ id: "a", phone: " 912345678 " }], aE164Chile)
    expect(cambios).toEqual([{ id: "a", anterior: " 912345678 ", nuevo: "+56912345678" }])
  })
})

describe("normalizar-telefonos: resumen", () => {
  const totales = { revisados: 8, cambios: 3, escritos: 2, yaNormalizados: 1, ilegibles: 2, vacios: 2 }

  it("sólo conteos: nunca un teléfono", () => {
    const texto = resumen(totales, { aplicar: false, negocio: null })
    expect(texto).toContain("Simulación")
    expect(texto).toContain("se normalizarían: 3")
    expect(texto).toContain("--aplicar")
    expect(texto).not.toMatch(/\+56\d/)
  })

  it("al aplicar dice cuántos se escribieron de los que tocaba, y en qué negocio", () => {
    const texto = resumen(totales, { aplicar: true, negocio: "neg-1" })
    expect(texto).toContain("el negocio neg-1")
    expect(texto).toContain("normalizados: 2 de 3")
  })
})
