import { describe, it, expect } from "vitest"
import { ALFABETO_DEL_CODIGO, LARGO_DEL_CODIGO, finDeLaPrueba, generarCodigoInvitacion } from "./prueba"
import { DIAS_DE_PRUEBA } from "./precios"

describe("finDeLaPrueba", () => {
  it("termina DIAS_DE_PRUEBA días exactos después de crear el negocio", () => {
    const desde = new Date("2026-10-22T15:30:00.000Z")
    expect(DIAS_DE_PRUEBA).toBe(7)
    expect(finDeLaPrueba(desde).toISOString()).toBe("2026-10-29T15:30:00.000Z")
  })

  it("no modifica la fecha que recibe", () => {
    const desde = new Date("2026-10-22T15:30:00.000Z")
    finDeLaPrueba(desde)
    expect(desde.toISOString()).toBe("2026-10-22T15:30:00.000Z")
  })
})

describe("generarCodigoInvitacion", () => {
  it("el alfabeto tiene 32 símbolos distintos, sin i, l, o ni u", () => {
    expect(ALFABETO_DEL_CODIGO).toHaveLength(32)
    expect(new Set(ALFABETO_DEL_CODIGO).size).toBe(32)
    expect(ALFABETO_DEL_CODIGO).not.toMatch(/[ilou]/)
  })

  it("tiene el largo fijo y sólo usa el alfabeto", () => {
    const patron = new RegExp(`^[${ALFABETO_DEL_CODIGO}]{${LARGO_DEL_CODIGO}}$`)
    for (let i = 0; i < 200; i++) {
      expect(generarCodigoInvitacion()).toMatch(patron)
    }
  })

  it("no repite en 10.000 códigos", () => {
    const codigos = new Set(Array.from({ length: 10_000 }, generarCodigoInvitacion))
    expect(codigos.size).toBe(10_000)
  })

  it("usa todo el alfabeto (no queda pegado a unos pocos símbolos)", () => {
    const vistos = new Set(Array.from({ length: 500 }, generarCodigoInvitacion).join(""))
    expect(vistos.size).toBe(32)
  })
})
