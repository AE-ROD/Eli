import { describe, expect, it } from "vitest"
import { alternarUna, conMarca, estadoDeLaSeleccion, marcadasEntre } from "./seleccion-multiple"

describe("estadoDeLaSeleccion", () => {
  it("ninguna, algunas o todas las filas del grupo", () => {
    expect(estadoDeLaSeleccion(new Set(), ["a", "b"])).toBe("ninguno")
    expect(estadoDeLaSeleccion(new Set(["a"]), ["a", "b"])).toBe("algunos")
    expect(estadoDeLaSeleccion(new Set(["a", "b", "z"]), ["a", "b"])).toBe("todos")
  })

  it("un grupo sin filas no se ve tildado", () => {
    expect(estadoDeLaSeleccion(new Set(["a"]), [])).toBe("ninguno")
  })

  it("lo marcado fuera del grupo no cuenta", () => {
    expect(estadoDeLaSeleccion(new Set(["z"]), ["a", "b"])).toBe("ninguno")
  })
})

describe("conMarca y alternarUna", () => {
  it("marca y desmarca varias filas sin mutar la selección que recibe", () => {
    const antes: ReadonlySet<string> = new Set(["a"])
    const con = conMarca(antes, ["b", "c"], true)
    expect([...con].sort()).toEqual(["a", "b", "c"])
    expect([...antes]).toEqual(["a"])
    expect([...conMarca(con, ["a", "c"], false)]).toEqual(["b"])
  })

  it("alterna una fila", () => {
    const una = alternarUna(new Set(), "a")
    expect(una.has("a")).toBe(true)
    expect(alternarUna(una, "a").has("a")).toBe(false)
  })
})

describe("marcadasEntre", () => {
  it("deja sólo lo marcado que se ve, en el orden de la lista", () => {
    expect(marcadasEntre(new Set(["c", "a", "oculta"]), ["a", "b", "c"])).toEqual(["a", "c"])
    expect(marcadasEntre(new Set(), ["a"])).toEqual([])
  })
})
