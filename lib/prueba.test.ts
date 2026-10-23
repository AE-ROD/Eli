import { describe, it, expect } from "vitest"
import {
  ALFABETO_DEL_CODIGO,
  LARGO_DEL_CODIGO,
  finDeLaPrueba,
  generarCodigoInvitacion,
  normalizarCodigoInvitacion,
  pruebaExtendidaPorReferido,
} from "./prueba"
import { DIAS_DE_PRUEBA, DIAS_EXTRA_POR_REFERIDO } from "./precios"

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

describe("normalizarCodigoInvitacion", () => {
  it("acepta un código generado", () => {
    const codigo = generarCodigoInvitacion()
    expect(normalizarCodigoInvitacion(codigo)).toBe(codigo)
  })

  it("acepta los 10 hex de los negocios que existían antes", () => {
    expect(normalizarCodigoInvitacion("0a9f3c7be1")).toBe("0a9f3c7be1")
  })

  it("ignora espacios alrededor y mayúsculas", () => {
    expect(normalizarCodigoInvitacion("  AB12CD34EF ")).toBe("ab12cd34ef")
  })

  it.each([
    ["vacío", ""],
    ["corto", "ab12cd34e"],
    ["largo", "ab12cd34efg"],
    ["con una letra fuera del alfabeto (i)", "ab12cd34ei"],
    ["con una u", "ab12cd34eu"],
    ["con un guión", "ab12-d34ef"],
    ["con un intento de inyección", "'; drop --"],
    ["un número", 1234567890],
    ["null", null],
    ["un objeto", { codigo: "ab12cd34ef" }],
  ])("%s → null", (_caso, valor) => {
    expect(normalizarCodigoInvitacion(valor)).toBeNull()
  })
})

describe("pruebaExtendidaPorReferido", () => {
  const ahora = new Date("2026-10-22T12:00:00.000Z")

  it("con la prueba corriendo, suma los días a su fin y no desde hoy", () => {
    expect(DIAS_EXTRA_POR_REFERIDO).toBe(7)
    const fin = new Date("2026-10-25T08:00:00.000Z")
    expect(pruebaExtendidaPorReferido(fin, ahora).toISOString()).toBe("2026-11-01T08:00:00.000Z")
  })

  it("con la prueba vencida, los cuenta desde ahora", () => {
    const vencida = new Date("2026-09-01T00:00:00.000Z")
    expect(pruebaExtendidaPorReferido(vencida, ahora).toISOString()).toBe("2026-10-29T12:00:00.000Z")
  })

  it("si vence justo ahora, da lo mismo desde dónde se cuente", () => {
    expect(pruebaExtendidaPorReferido(ahora, ahora).toISOString()).toBe("2026-10-29T12:00:00.000Z")
  })

  it("no modifica las fechas que recibe", () => {
    const fin = new Date("2026-10-25T08:00:00.000Z")
    pruebaExtendidaPorReferido(fin, ahora)
    expect(fin.toISOString()).toBe("2026-10-25T08:00:00.000Z")
    expect(ahora.toISOString()).toBe("2026-10-22T12:00:00.000Z")
  })
})
