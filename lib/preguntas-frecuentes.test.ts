import { describe, it, expect } from "vitest"
import { AREAS } from "./soporte"
import {
  PREGUNTAS_FRECUENTES,
  buscarPreguntas,
  normalizarTexto,
  preguntasDeArea,
  type PreguntaFrecuente,
} from "./preguntas-frecuentes"

describe("normalizarTexto", () => {
  it("quita tildes, diéresis y la virgulilla de la ñ", () => {
    expect(normalizarTexto("Contraseña")).toBe("contrasena")
    expect(normalizarTexto("Configuración")).toBe("configuracion")
    expect(normalizarTexto("pingüino")).toBe("pinguino")
  })

  it("pasa a minúsculas y colapsa los espacios", () => {
    expect(normalizarTexto("  CÓMO   Cobro  ")).toBe("como cobro")
  })
})

describe("buscarPreguntas", () => {
  const ejemplo: PreguntaFrecuente[] = [
    { id: "a", area: "agenda", pregunta: "¿Cómo cancelo una cita?", respuesta: ["Desde la agenda."], palabrasClave: [] },
    { id: "b", area: "tablero", pregunta: "¿Cómo cobro?", respuesta: ["Puedes cancelar el cobro."], palabrasClave: [] },
    { id: "c", area: "cuenta-y-plan", pregunta: "Olvidé mi clave", respuesta: ["Restablécela."], palabrasClave: ["contraseña"] },
  ]

  it("no le importan las tildes ni las mayúsculas", () => {
    expect(buscarPreguntas("CONTRASENA", { preguntas: ejemplo }).map((p) => p.id)).toEqual(["c"])
    expect(buscarPreguntas("olvide", { preguntas: ejemplo }).map((p) => p.id)).toEqual(["c"])
    expect(buscarPreguntas("cómo", { preguntas: ejemplo }).map((p) => p.id)).toEqual(["a", "b"])
  })

  it("exige todas las palabras", () => {
    expect(buscarPreguntas("cancelo cita", { preguntas: ejemplo }).map((p) => p.id)).toEqual(["a"])
    expect(buscarPreguntas("cancelo whatsapp", { preguntas: ejemplo })).toEqual([])
  })

  it("pone primero las que tienen la palabra en la pregunta", () => {
    expect(buscarPreguntas("cancel", { preguntas: ejemplo }).map((p) => p.id)).toEqual(["a", "b"])
    expect(buscarPreguntas("cobro", { preguntas: ejemplo }).map((p) => p.id)).toEqual(["b"])
  })

  it("filtra por área", () => {
    expect(buscarPreguntas("cancel", { preguntas: ejemplo, area: "tablero" }).map((p) => p.id)).toEqual(["b"])
    expect(buscarPreguntas("", { preguntas: ejemplo, area: "agenda" }).map((p) => p.id)).toEqual(["a"])
  })

  it("sin consulta ni área devuelve todas, en su orden", () => {
    expect(buscarPreguntas("   ", { preguntas: ejemplo }).map((p) => p.id)).toEqual(["a", "b", "c"])
  })

  it("encuentra en el catálogo real sin tildes", () => {
    const ids = buscarPreguntas("contrasena").map((p) => p.id)
    expect(ids).toContain("cuenta-contrasena")
  })
})

describe("PREGUNTAS_FRECUENTES", () => {
  it("no repite ids", () => {
    const ids = PREGUNTAS_FRECUENTES.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("cada área de soporte tiene al menos tres preguntas", () => {
    for (const area of AREAS) {
      expect(preguntasDeArea(area.valor, 99).length, area.valor).toBeGreaterThanOrEqual(3)
    }
  })

  it("preguntasDeArea devuelve como máximo las pedidas, sólo del área", () => {
    const delTablero = preguntasDeArea("tablero", 2)
    expect(delTablero).toHaveLength(2)
    expect(delTablero.every((p) => p.area === "tablero")).toBe(true)
  })

  it("no promete lo que el producto no hace", () => {
    // Las respuestas que nombran estas cosas tienen que ser para decir que no.
    const prohibidas = /comisi|sms|elegir (al|el) profesional al reservar/i
    for (const pregunta of PREGUNTAS_FRECUENTES) {
      expect(pregunta.respuesta.join(" "), pregunta.id).not.toMatch(prohibidas)
    }
  })

  it("escribe \"solo\" sin tilde", () => {
    for (const pregunta of PREGUNTAS_FRECUENTES) {
      const texto = [pregunta.pregunta, ...pregunta.respuesta].join(" ")
      expect(texto, pregunta.id).not.toMatch(/\bsólo\b/i)
    }
  })
})
