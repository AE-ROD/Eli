import { describe, it, expect } from "vitest"
import {
  erroresDeTusDatos,
  profesionalSigueValiendo,
  serviciosQueNoSePuedenSumar,
} from "./reglas-de-la-reserva"

/*
 * Un salón con tres servicios: Ana hace color y corte; Bea, corte y uñas.
 * Nadie hace color con uñas: elegido el color, las uñas no se pueden sumar.
 */
const equipo = [
  { id: "ana", servicioIds: ["color", "corte"] },
  { id: "bea", servicioIds: ["corte", "unas"] },
]
const servicios = ["color", "corte", "unas"]

describe("serviciosQueNoSePuedenSumar", () => {
  it("sin nada elegido, sólo bloquea lo que nadie hace", () => {
    expect(serviciosQueNoSePuedenSumar([...servicios, "masaje"], [], equipo)).toEqual(new Set(["masaje"]))
  })

  it("elegido el color, bloquea las uñas: nadie hace las dos", () => {
    expect(serviciosQueNoSePuedenSumar(servicios, ["color"], equipo)).toEqual(new Set(["unas"]))
  })

  it("elegido el corte, deja sumar los dos: cada uno lo hace alguien que corta", () => {
    expect(serviciosQueNoSePuedenSumar(servicios, ["corte"], equipo).size).toBe(0)
  })

  it("nunca bloquea lo ya elegido", () => {
    expect(serviciosQueNoSePuedenSumar(servicios, ["color", "corte"], equipo).has("color")).toBe(false)
  })

  it("quien no tiene servicios definidos hace todos", () => {
    expect(serviciosQueNoSePuedenSumar(servicios, ["color"], [...equipo, { id: "caro", servicioIds: null }]).size).toBe(0)
  })

  it("sin equipo (no se leyó, o atiende el dueño) no bloquea nada", () => {
    expect(serviciosQueNoSePuedenSumar(servicios, ["color"], null).size).toBe(0)
    expect(serviciosQueNoSePuedenSumar(servicios, ["color"], []).size).toBe(0)
  })
})

describe("profesionalSigueValiendo", () => {
  it("vale si es del equipo y hace todos los elegidos", () => {
    expect(profesionalSigueValiendo("ana", equipo, ["color", "corte"])).toBe(true)
  })

  it("no vale si no hace alguno de los elegidos (?profesional= con otro servicio)", () => {
    expect(profesionalSigueValiendo("bea", equipo, ["color"])).toBe(false)
  })

  it("no vale si no es del equipo", () => {
    expect(profesionalSigueValiendo("otra", equipo, [])).toBe(false)
  })

  it("sin elegido, o con el equipo sin leer, no se decide acá", () => {
    expect(profesionalSigueValiendo(null, equipo, ["color"])).toBe(true)
    expect(profesionalSigueValiendo("otra", null, ["color"])).toBe(true)
  })
})

describe("erroresDeTusDatos", () => {
  it("con nombre, apellido y sin correo, no hay errores", () => {
    expect(erroresDeTusDatos({ nombre: "Ana", apellido: "Pérez", email: "" })).toEqual({})
  })

  it("un nombre de puros espacios cuenta como vacío", () => {
    expect(erroresDeTusDatos({ nombre: "   ", apellido: "  ", email: "" })).toEqual({
      nombre: "Escribe tu nombre.",
      apellido: "Escribe tu apellido.",
    })
  })

  it("pide al menos dos letras, como el servidor", () => {
    expect(erroresDeTusDatos({ nombre: " A ", apellido: "Pérez", email: "" }).nombre).toMatch(/al menos 2/)
  })

  it("un correo escrito tiene que tener forma de correo", () => {
    expect(erroresDeTusDatos({ nombre: "Ana", apellido: "Pérez", email: "ana@correo" }).email).toBeDefined()
    expect(erroresDeTusDatos({ nombre: "Ana", apellido: "Pérez", email: " ana@correo.cl " }).email).toBeUndefined()
  })
})
