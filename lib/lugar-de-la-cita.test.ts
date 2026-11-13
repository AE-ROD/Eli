import { describe, it, expect } from "vitest"
import { lugarParaElCorreo } from "./lugar-de-la-cita"

const SEDE = { nombre: "Providencia", direccion: "Av. Providencia 1234", comuna: "Providencia" }

describe("lugarParaElCorreo", () => {
  it("si la hora tiene sede, dice dónde queda", () => {
    expect(lugarParaElCorreo(SEDE)).toEqual(SEDE)
  })

  it("una hora sin sede (de antes de las sedes, o de un plan Equipo) sale como siempre", () => {
    expect(lugarParaElCorreo(null)).toBeUndefined()
    expect(lugarParaElCorreo(undefined)).toBeUndefined()
  })

  it("no deja pasar nada más de la sede que nombre, dirección y comuna", () => {
    const conDeMas = { ...SEDE, id: "sede-1", telefono: "+56911112222" } as typeof SEDE
    expect(Object.keys(lugarParaElCorreo(conDeMas) ?? {}).sort()).toEqual(["comuna", "direccion", "nombre"])
  })

  it("recorta los textos y saca las partes vacías", () => {
    expect(lugarParaElCorreo({ nombre: " Centro ", direccion: " Calle 1 ", comuna: "  " })).toMatchObject({
      nombre: "Centro",
      direccion: "Calle 1",
    })
  })

  it("una sede sin nada que decir no agrega un lugar vacío", () => {
    expect(lugarParaElCorreo({ nombre: " ", direccion: "", comuna: "" })).toBeUndefined()
  })
})
