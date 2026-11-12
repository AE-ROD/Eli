import { describe, expect, it } from "vitest"
import { delRol, nombreDelRol } from "./nombres-de-roles"

describe("nombreDelRol", () => {
  it("el admin se llama Encargado", () => {
    expect(nombreDelRol("admin")).toBe("Encargado")
  })

  it("el worker se llama Profesional", () => {
    expect(nombreDelRol("worker")).toBe("Profesional")
  })

  it("un rol desconocido o ausente se lee como Profesional", () => {
    expect(nombreDelRol("otro")).toBe("Profesional")
    expect(nombreDelRol(undefined)).toBe("Profesional")
  })

  it("en una clínica dental el worker se llama Odontólogo; el encargado sigue siendo Encargado", () => {
    expect(nombreDelRol("worker", "odontologia")).toBe("Odontólogo")
    expect(nombreDelRol(undefined, "odontologia")).toBe("Odontólogo")
    expect(nombreDelRol("admin", "odontologia")).toBe("Encargado")
  })

  it("los demás rubros, uno desconocido o ninguno, dicen lo de siempre", () => {
    for (const rubro of ["salon", "barberia", "spa-de-unas", "constructor", "", null, undefined]) {
      expect(nombreDelRol("worker", rubro)).toBe("Profesional")
      expect(nombreDelRol("admin", rubro)).toBe("Encargado")
    }
  })
})

describe("delRol", () => {
  it("el encargado es «del encargado» en todos los rubros", () => {
    for (const rubro of ["salon", "barberia", "odontologia", "constructor", null, undefined]) {
      expect(delRol("admin", rubro)).toBe("del encargado")
    }
  })

  it("el profesional concuerda con la palabra del rubro: del barbero, de la estilista, del odontólogo", () => {
    expect(delRol("worker", "barberia")).toBe("del barbero")
    expect(delRol("worker", "salon")).toBe("de la estilista")
    expect(delRol("worker", "spa-de-unas")).toBe("de la manicurista")
    expect(delRol("worker", "odontologia")).toBe("del odontólogo")
  })

  it("sin rubro conocido, del profesional; un rol desconocido o ausente se lee como profesional", () => {
    expect(delRol("worker")).toBe("del profesional")
    expect(delRol("worker", "constructor")).toBe("del profesional")
    expect(delRol(undefined, "salon")).toBe("de la estilista")
    expect(delRol("otro", "barberia")).toBe("del barbero")
  })
})
