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

  describe("sin sede, la dirección del negocio", () => {
    const NEGOCIO = { address: " Av. Italia 1500 ", comuna: " Ñuñoa " }

    it("dice la dirección y la comuna del negocio, sin nombre", () => {
      expect(lugarParaElCorreo(null, NEGOCIO)).toEqual({ direccion: "Av. Italia 1500", comuna: "Ñuñoa" })
    })

    it("sin comuna, la dirección sola", () => {
      expect(lugarParaElCorreo(undefined, { address: "Calle 1", comuna: null })).toEqual({ direccion: "Calle 1", comuna: null })
    })

    it("un negocio sin calle no tiene qué decir: la comuna sola no lleva a ningún lado", () => {
      expect(lugarParaElCorreo(null, { address: "  ", comuna: "Ñuñoa" })).toBeUndefined()
      expect(lugarParaElCorreo(null, { address: null, comuna: null })).toBeUndefined()
      expect(lugarParaElCorreo(null, null)).toBeUndefined()
    })

    it("con sede, manda la sede aunque el negocio tenga dirección", () => {
      expect(lugarParaElCorreo(SEDE, NEGOCIO)).toEqual(SEDE)
    })
  })
})
