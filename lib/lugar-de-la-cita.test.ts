import { describe, it, expect } from "vitest"
import { lugarParaElCorreo } from "./lugar-de-la-cita"

const SEDE = { nombre: "Providencia", direccion: "Av. Providencia 1234", comuna: "Providencia" }
const DOS = [{ activo: true }, { activo: true }]

describe("lugarParaElCorreo", () => {
  it("con varias sedes activas y la sede de la cita, dice dónde queda", () => {
    expect(lugarParaElCorreo({ plan: "independiente", sedesActivas: DOS, sede: SEDE })).toEqual(SEDE)
  })

  it("con una sola sede activa el negocio se comporta como siempre: el correo no dice dónde", () => {
    expect(lugarParaElCorreo({ plan: "independiente", sedesActivas: [{ activo: true }], sede: SEDE })).toBeUndefined()
  })

  it("sin sedes activas, tampoco", () => {
    expect(lugarParaElCorreo({ plan: "independiente", sedesActivas: [], sede: SEDE })).toBeUndefined()
    expect(lugarParaElCorreo({ plan: "independiente", sedesActivas: null, sede: SEDE })).toBeUndefined()
    expect(lugarParaElCorreo({ plan: "independiente", sedesActivas: undefined, sede: SEDE })).toBeUndefined()
  })

  it("una sede desactivada no cuenta para el modo", () => {
    expect(lugarParaElCorreo({ plan: "independiente", sedesActivas: [{ activo: true }, { activo: false }], sede: SEDE })).toBeUndefined()
  })

  it("falla cerrado: un plan Equipo, desconocido o ausente es siempre 'una', aunque lleguen sedes", () => {
    for (const plan of ["equipo", "otro", "", null, undefined]) {
      expect(lugarParaElCorreo({ plan, sedesActivas: DOS, sede: SEDE })).toBeUndefined()
    }
  })

  it("una cita sin sede (de antes de que el negocio tuviera sedes) sale como siempre", () => {
    expect(lugarParaElCorreo({ plan: "independiente", sedesActivas: DOS, sede: null })).toBeUndefined()
    expect(lugarParaElCorreo({ plan: "independiente", sedesActivas: DOS, sede: undefined })).toBeUndefined()
  })

  it("la sede de la cita cuenta aunque se haya desactivado después: la hora ya se dio ahí", () => {
    // `sede` no trae `activo`: lo que decide el modo son las sedes activas del negocio, no la de la cita.
    expect(lugarParaElCorreo({ plan: "independiente", sedesActivas: DOS, sede: SEDE })).toMatchObject({ nombre: "Providencia" })
  })

  it("recorta los textos y deja afuera lo vacío", () => {
    expect(
      lugarParaElCorreo({ plan: "independiente", sedesActivas: DOS, sede: { nombre: " Centro ", direccion: " Calle 1 ", comuna: "  " } })
    ).toEqual({ nombre: "Centro", direccion: "Calle 1", comuna: null })
  })

  it("si no queda nada que decir, el correo sale como siempre", () => {
    expect(
      lugarParaElCorreo({ plan: "independiente", sedesActivas: DOS, sede: { nombre: " ", direccion: "", comuna: "" } })
    ).toBeUndefined()
  })
})
