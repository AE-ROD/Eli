import { describe, it, expect } from "vitest"
import { MODULOS, moduloPorId, type ModuloId } from "./modulos"

describe("MODULOS", () => {
  it("están en el orden del día de trabajo: agenda, tablero, clientes, reportes, equipo", () => {
    expect(MODULOS.map((modulo) => modulo.id)).toEqual([
      "agenda",
      "tablero",
      "clientes",
      "reportes",
      "equipo",
    ])
  })

  it("no repiten ids", () => {
    const ids = MODULOS.map((modulo) => modulo.id)
    expect(new Set(ids).size).toBe(MODULOS.length)
  })

  it("no repiten colores: el pastel es lo que distingue a un módulo de otro", () => {
    const colores = MODULOS.map((modulo) => modulo.color)
    expect(new Set(colores).size).toBe(MODULOS.length)
  })

  it("cada uno tiene su color asignado", () => {
    expect(Object.fromEntries(MODULOS.map((modulo) => [modulo.id, modulo.color]))).toEqual({
      agenda: "azul",
      tablero: "naranja",
      clientes: "lila",
      reportes: "lima",
      equipo: "turquesa",
    })
  })

  it("cada uno apunta a su pantalla del panel y tiene nombre y frase", () => {
    for (const modulo of MODULOS) {
      expect(modulo.ruta).toBe(`/dashboard/${modulo.id}`)
      expect(modulo.nombre.length).toBeGreaterThan(0)
      expect(modulo.descripcion.length).toBeGreaterThan(0)
    }
  })
})

describe("moduloPorId", () => {
  it.each(MODULOS.map((modulo) => [modulo.id, modulo.nombre] as const))(
    "el id %s devuelve el módulo %s",
    (id, nombre) => {
      const modulo = moduloPorId(id)
      expect(modulo.id).toBe(id)
      expect(modulo.nombre).toBe(nombre)
    }
  )

  it("devuelve el mismo objeto del catálogo, no una copia", () => {
    expect(moduloPorId("tablero")).toBe(MODULOS[1])
  })

  it("un id que no existe, colado con un cast, avisa en vez de devolver un hueco", () => {
    expect(() => moduloPorId("pacientes" as ModuloId)).toThrow()
    expect(() => moduloPorId("constructor" as ModuloId)).toThrow()
  })
})
