import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { CitaDelEnlace } from "../_datos"
import { ComoLlegar, ResumenDeLaCita } from "./gestion-de-cita"

/*
 * El enlace para cancelar o cambiar con sedes (plan Independiente): la cita de una
 * sede dice su nombre y su dirección y lleva "Cómo llegar" a ESA dirección. Sin
 * sede (un negocio sin sedes, o una cita de antes) la pantalla es la de siempre.
 */

const MAPAS = { googleMaps: "https://maps.test/centro?a=1&b=2", waze: "https://waze.test/centro" }

const cita = (extra: Partial<CitaDelEnlace> = {}): CitaDelEnlace => ({
  negocio: { nombre: "Salón Uno" },
  servicio: { nombre: "Corte de pelo", duracion: 60 },
  precio: 8000,
  profesional: null,
  fecha: "2030-01-07",
  hora: "10:00",
  zona: "America/Santiago",
  plazoHoras: 24,
  sePuedeCambiar: true,
  sePuedeReagendar: true,
  diasConAtencion: [1],
  ...extra,
})

const resumen = (datos: CitaDelEnlace) =>
  renderToString(createElement(ResumenDeLaCita, { cita: datos, terminoDelServicio: "Servicio" })).replaceAll("<!-- -->", "")

describe("ResumenDeLaCita con sede", () => {
  it("dice la sede y su dirección con la comuna, junto al día y la hora", () => {
    const html = resumen(cita({ sede: { nombre: "Centro", direccion: "Av. Italia 1234", comuna: "Providencia", mapas: MAPAS } }))

    expect(html).toContain(">Sede</dt>")
    expect(html).toContain(">Centro</dd>")
    expect(html).toContain(">Dirección</dt>")
    expect(html).toContain(">Av. Italia 1234, Providencia</dd>")
    expect(html).toContain(">Día</dt>")
  })

  it("sin sede es la pantalla de siempre: sin filas de sede ni de dirección", () => {
    const html = resumen(cita())

    expect(html).not.toContain("Sede")
    expect(html).not.toContain("Dirección")
    expect(html).toContain(">Dónde</dt>")
    expect(html).toContain(">Salón Uno</dd>")
  })
})

describe("ComoLlegar", () => {
  it("dos enlaces que abren aparte, a ESA dirección, con el nombre de la sede para el lector de pantalla", () => {
    const html = renderToString(createElement(ComoLlegar, { sede: "Centro", mapas: MAPAS }))

    expect(html).toContain('aria-label="Cómo llegar a Centro con Google Maps"')
    expect(html).toContain('aria-label="Cómo llegar a Centro con Waze"')
    expect(html).toContain('href="https://maps.test/centro?a=1&amp;b=2"')
    expect(html).toContain('href="https://waze.test/centro"')
    expect(html.match(/rel="noopener noreferrer"/g)).toHaveLength(2)
    expect(html.match(/target="_blank"/g)).toHaveLength(2)
  })
})
