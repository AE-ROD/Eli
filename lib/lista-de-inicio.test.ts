import { describe, it, expect } from "vitest"
import { PASOS_DE_INICIO, cuantosHechos, mostrarListaDeInicio, pruebaTerminada, type PasosHechos } from "./lista-de-inicio"

const ninguno: PasosHechos = { horario: false, servicios: false, enlace: false, primeraReserva: false }
const todos: PasosHechos = { horario: true, servicios: true, enlace: true, primeraReserva: true }

describe("lista de inicio", () => {
  it("son cuatro pasos, sin repetir", () => {
    expect(PASOS_DE_INICIO.map((paso) => paso.id)).toEqual(["horario", "servicios", "enlace", "primeraReserva"])
  })

  it("cuenta los pasos hechos", () => {
    expect(cuantosHechos(ninguno)).toBe(0)
    expect(cuantosHechos({ ...ninguno, horario: true, enlace: true })).toBe(2)
    expect(cuantosHechos(todos)).toBe(4)
  })

  it("se muestra mientras falte algo y la prueba siga", () => {
    expect(mostrarListaDeInicio({ pasos: ninguno, pruebaTerminada: false })).toBe(true)
    expect(mostrarListaDeInicio({ pasos: { ...todos, primeraReserva: false }, pruebaTerminada: false })).toBe(true)
  })

  it("se oculta con los cuatro hechos o con la prueba terminada", () => {
    expect(mostrarListaDeInicio({ pasos: todos, pruebaTerminada: false })).toBe(false)
    expect(mostrarListaDeInicio({ pasos: ninguno, pruebaTerminada: true })).toBe(false)
  })

  it("la prueba termina justo en su fin", () => {
    const fin = new Date("2026-10-22T12:00:00.000Z")
    expect(pruebaTerminada(fin, new Date("2026-10-22T11:59:59.999Z"))).toBe(false)
    expect(pruebaTerminada(fin, fin)).toBe(true)
  })
})
