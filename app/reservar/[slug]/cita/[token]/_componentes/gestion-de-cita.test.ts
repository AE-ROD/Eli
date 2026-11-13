import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { GestionDeCita } from "./gestion-de-cita"

/*
 * La primera pintura del enlace para cancelar o cambiar: lo que lee el lector
 * de pantalla mientras carga la reserva, con la palabra del rubro. Lo demás
 * (los textos de la reserva ya cargada) está probado en `_frases.test.ts`.
 */

const pintar = (rubro?: string | null) =>
  renderToString(createElement(GestionDeCita, { slug: "salon-uno", token: "t".repeat(43), rubro }))

describe("GestionDeCita: la primera pintura", () => {
  it("sin rubro, o con uno desconocido: 'Cargando tu cita...'", () => {
    expect(pintar()).toContain("Cargando tu cita...")
    expect(pintar(null)).toContain("Cargando tu cita...")
    expect(pintar("salud")).toContain("Cargando tu cita...")
  })

  it("un salón o una clínica: 'Cargando tu hora...'", () => {
    expect(pintar("salon")).toContain("Cargando tu hora...")
    expect(pintar("odontologia")).toContain("Cargando tu hora...")
  })
})
