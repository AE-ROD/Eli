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
})
