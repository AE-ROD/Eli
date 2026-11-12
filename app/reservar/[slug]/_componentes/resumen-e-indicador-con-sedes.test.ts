import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { IndicadorDePasos, PASOS_DE_RESERVA, pasosDeLaReserva } from "./indicador-de-pasos"
import { ResumenDeReserva } from "./resumen-de-reserva"

const pintar = (elemento: ReturnType<typeof createElement>) => renderToString(elemento).replaceAll("<!-- -->", "")

describe("pasosDeLaReserva", () => {
  it("sin sedes son los tres de siempre; con sedes, '¿Dónde?' va primero", () => {
    expect(pasosDeLaReserva("Servicio")).toEqual(["Servicio", "Día y hora", "Tus datos"])
    expect(pasosDeLaReserva("Motivo", "Dónde")).toEqual(["Dónde", "Motivo", "Día y hora", "Tus datos"])
    expect(PASOS_DE_RESERVA).toEqual(["Servicio", "Día y hora", "Tus datos"])
  })
})

describe("IndicadorDePasos", () => {
  it("con tres pasos es el de siempre: tres columnas y el nombre al lado del número", () => {
    const html = pintar(createElement(IndicadorDePasos, { paso: 2 }))

    expect(html).toContain("grid-cols-3")
    expect(html).not.toContain("grid-cols-4")
    expect(html).not.toContain("flex-col items-start")
    expect(html.match(/<li /g)).toHaveLength(3)
  })

  it("con cuatro: cuatro columnas, el actual marcado y los anteriores 'listo'", () => {
    const html = pintar(createElement(IndicadorDePasos, { paso: 3, pasos: pasosDeLaReserva("Servicio", "Dónde") }))

    expect(html).toContain("grid-cols-4")
    expect(html.match(/<li /g)).toHaveLength(4)
    expect(html.match(/aria-current="step"/g)).toHaveLength(1)
    expect(html).toContain("Paso 3: </span>Día y hora")
    expect(html.match(/, listo/g)).toHaveLength(2)
  })
})

describe("ResumenDeReserva con sede", () => {
  const props = { servicio: { id: "s", name: "Corte", description: null, duration: 60, price: 8000, category: null }, fecha: "2030-01-07", hora: "10:00" }

  it("dice la sede y su dirección con la comuna", () => {
    const html = pintar(createElement(ResumenDeReserva, { ...props, sede: { nombre: "Centro", direccion: "Av. Italia 1234", comuna: "Providencia" } }))

    expect(html).toContain(">Sede</dt>")
    expect(html).toContain("Centro")
    expect(html).toContain("Av. Italia 1234, Providencia")
  })

  it("sin sede (o `null`) es el resumen de siempre", () => {
    const deSiempre = pintar(createElement(ResumenDeReserva, props))

    expect(pintar(createElement(ResumenDeReserva, { ...props, sede: null }))).toBe(deSiempre)
    expect(deSiempre).not.toContain("Sede")
  })
})
