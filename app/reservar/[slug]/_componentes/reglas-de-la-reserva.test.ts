import { describe, it, expect } from "vitest"
import {
  avisoDeServiciosQuitados,
  erroresDeTusDatos,
  profesionalSigueValiendo,
  separarLosQueNoHace,
  serviciosQueNoSePuedenSumar,
  serviciosQueVe,
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

/* El catálogo de un salón de barrio, con nombre, para mirar qué ve cada profesional. */
const catalogo = [
  { id: "corte", name: "Corte" },
  { id: "barba", name: "Barba" },
  { id: "tinte", name: "Tinte" },
  { id: "higiene", name: "Higiene" },
]
const hace = (...servicioIds: string[]) => ({ id: "carla", servicioIds })

describe("serviciosQueVe", () => {
  it("sin profesional ('cualquiera') ve todos los servicios", () => {
    expect(serviciosQueVe(null, catalogo)).toEqual(catalogo)
  })

  it("un profesional con servicios acotados ve sólo esos, en el orden del catálogo", () => {
    expect(serviciosQueVe(hace("tinte", "corte"), catalogo)).toEqual([catalogo[0], catalogo[2]])
  })

  it("servicioIds en null: hace todos, los ve todos", () => {
    expect(serviciosQueVe({ id: "pedro", servicioIds: null }, catalogo)).toEqual(catalogo)
  })

  it("ignora un id que no está en el catálogo (un servicio inactivo)", () => {
    expect(serviciosQueVe(hace("corte", "viejo-inactivo"), catalogo)).toEqual([catalogo[0]])
  })

  it("quien no hace ninguno de los que hay no ve ninguno", () => {
    expect(serviciosQueVe(hace(), catalogo)).toEqual([])
  })

  it("no cambia la lista que recibe", () => {
    const original = [...catalogo]
    serviciosQueVe(hace("corte"), original)
    serviciosQueVe(null, original).pop()
    expect(original).toEqual(catalogo)
  })
})

describe("separarLosQueNoHace", () => {
  const elegidos = [catalogo[2], catalogo[0], catalogo[1]] // tinte, corte, barba: en ese orden se hacen

  it("deja los que hace, en el orden en que se eligieron, y separa los que no", () => {
    expect(separarLosQueNoHace(hace("corte", "barba"), elegidos)).toEqual({
      quedan: [catalogo[0], catalogo[1]],
      quitados: [catalogo[2]],
    })
  })

  it("si hace todos los elegidos no quita nada", () => {
    expect(separarLosQueNoHace(hace("corte", "barba", "tinte"), elegidos)).toEqual({ quedan: elegidos, quitados: [] })
    expect(separarLosQueNoHace({ id: "pedro", servicioIds: null }, elegidos)).toEqual({ quedan: elegidos, quitados: [] })
  })

  it("sin profesional ('cualquiera') no quita nada", () => {
    expect(separarLosQueNoHace(null, elegidos)).toEqual({ quedan: elegidos, quitados: [] })
  })

  it("si no hace ninguno, quita todos", () => {
    expect(separarLosQueNoHace(hace("higiene"), elegidos)).toEqual({ quedan: [], quitados: elegidos })
  })

  it("sin nada elegido no hay nada que quitar", () => {
    expect(separarLosQueNoHace(hace("corte"), [])).toEqual({ quedan: [], quitados: [] })
  })
})

describe("avisoDeServiciosQuitados", () => {
  it("uno: 'lo hace'", () => {
    expect(avisoDeServiciosQuitados("Carla", [catalogo[1]])).toBe("Quitamos Barba porque Carla no lo hace.")
  })

  it("varios: 'los hace', con 'y' antes del último", () => {
    expect(avisoDeServiciosQuitados("Carla", [catalogo[1], catalogo[2]])).toBe("Quitamos Barba y Tinte porque Carla no los hace.")
    expect(avisoDeServiciosQuitados("Carla", [catalogo[0], catalogo[1], catalogo[2]])).toBe(
      "Quitamos Corte, Barba y Tinte porque Carla no los hace."
    )
  })

  it("'e' en vez de 'y' ante un nombre que empieza con i", () => {
    expect(avisoDeServiciosQuitados("Carla", [catalogo[0], catalogo[3]])).toBe("Quitamos Corte e Higiene porque Carla no los hace.")
  })

  it("sin nada quitado, ningún aviso", () => {
    expect(avisoDeServiciosQuitados("Carla", [])).toBe("")
  })
})

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
