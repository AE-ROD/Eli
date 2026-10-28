import { describe, it, expect } from "vitest"
import { aE164Chile, mostrarTelefono } from "./telefono"
import { compartenContacto } from "./reserva-publica"

describe("aE164Chile", () => {
  it.each([
    ["9 1234 5678", "+56912345678"],
    ["+56 9 1234 5678", "+56912345678"],
    ["56912345678", "+56912345678"],
    ["912345678", "+56912345678"],
    ["+56912345678", "+56912345678"],
    ["  +56 (9) 1234-5678 ", "+56912345678"],
    ["0056 9 1234 5678", "+56912345678"],
    ["+56 2 2345 6789", "+56223456789"],
    ["(2) 2345 6789", "+56223456789"],
    ["02 2345 6789", "+56223456789"],
    ["32 212 3456", "+56322123456"],
  ])("%j → %j", (texto, esperado) => {
    expect(aE164Chile(texto)).toBe(esperado)
  })

  it.each([
    ["vacío", ""],
    ["sólo espacios", "   "],
    ["null", null],
    ["undefined", undefined],
    ["con letras", "9 1234 abcd"],
    ["de otro país", "+54 9 11 1234 5678"],
    ["de otro país con 00", "0054 11 1234 5678"],
    ["corto", "12345"],
    ["de 8 dígitos (antes de 2016)", "1234 5678"],
    ["largo", "+56 9 1234 56789"],
    ["empieza con 1", "123456789"],
    ["empieza con 0 sin ser un fijo", "012345678"],
    ["con un + en el medio", "56+912345678"],
  ])("rechaza uno %s", (_caso, texto) => {
    expect(aE164Chile(texto)).toBeNull()
  })
})

describe("mostrarTelefono", () => {
  it.each([
    ["+56912345678", "+56 9 1234 5678"],
    ["+56223456789", "+56 2 2345 6789"],
    ["+56322123456", "+56 32 212 3456"],
    // Datos guardados antes de normalizar: se leen igual.
    ["9 1234-5678", "+56 9 1234 5678"],
  ])("%j → %j", (e164, esperado) => {
    expect(mostrarTelefono(e164)).toBe(esperado)
  })

  it("lo que no es chileno se muestra tal como está", () => {
    expect(mostrarTelefono(" +54 11 1234 5678 ")).toBe("+54 11 1234 5678")
  })

  it("vacío o null no muestra nada", () => {
    expect(mostrarTelefono(null)).toBe("")
    expect(mostrarTelefono(undefined)).toBe("")
    expect(mostrarTelefono("")).toBe("")
  })
})

describe("un teléfono guardado en E.164 sigue reconociéndose en la reserva pública", () => {
  it.each(["9 1234 5678", "+56 9 1234 5678", "912345678", "56912345678"])("%j", (escrito) => {
    expect(compartenContacto({ email: null, phone: "+56912345678" }, { email: undefined, telefono: escrito })).toBe(true)
  })
})
