import { describe, expect, it } from "vitest"
import { moverEnLaLista } from "./orden-de-lista"

const LISTA = [
  { id: "a", nombre: "Providencia", orden: 0 },
  { id: "b", nombre: "Ñuñoa", orden: 1 },
  { id: "c", nombre: "Las Condes", orden: 2 },
]

describe("moverEnLaLista", () => {
  it("subir cambia de lugar con el de arriba, y sólo esos dos cambian de orden", () => {
    const movida = moverEnLaLista(LISTA, "b", -1)
    expect(movida?.lista.map((e) => [e.id, e.orden])).toEqual([["b", 0], ["a", 1], ["c", 2]])
    expect(movida?.cambios).toEqual([{ id: "b", orden: 0 }, { id: "a", orden: 1 }])
  })

  it("bajar cambia de lugar con el de abajo", () => {
    expect(moverEnLaLista(LISTA, "a", 1)?.lista.map((e) => e.id)).toEqual(["b", "a", "c"])
  })

  it("conserva el resto de lo que trae cada elemento", () => {
    expect(moverEnLaLista(LISTA, "c", -1)?.lista[1]).toEqual({ id: "c", nombre: "Las Condes", orden: 1 })
  })

  it("con órdenes repetidos o con huecos, los vuelve a numerar de 0 en adelante", () => {
    const repetidos = LISTA.map((e) => ({ ...e, orden: 5 }))
    const movida = moverEnLaLista(repetidos, "c", -1)
    expect(movida?.lista.map((e) => [e.id, e.orden])).toEqual([["a", 0], ["c", 1], ["b", 2]])
    expect(movida?.cambios).toEqual([{ id: "a", orden: 0 }, { id: "c", orden: 1 }, { id: "b", orden: 2 }])
  })

  it("el primero no sube, el último no baja, y uno que no está no se mueve", () => {
    expect(moverEnLaLista(LISTA, "a", -1)).toBeNull()
    expect(moverEnLaLista(LISTA, "c", 1)).toBeNull()
    expect(moverEnLaLista(LISTA, "x", 1)).toBeNull()
  })

  it("una lista de uno solo no se mueve", () => {
    expect(moverEnLaLista([LISTA[0]], "a", 1)).toBeNull()
    expect(moverEnLaLista([LISTA[0]], "a", -1)).toBeNull()
  })

  it("no toca la lista que recibe", () => {
    moverEnLaLista(LISTA, "b", -1)
    expect(LISTA.map((e) => e.id)).toEqual(["a", "b", "c"])
    expect(LISTA.map((e) => e.orden)).toEqual([0, 1, 2])
  })
})
