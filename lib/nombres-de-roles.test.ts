import { describe, expect, it } from "vitest"
import { nombreDelRol } from "./nombres-de-roles"

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
