import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { SelectorDeSede } from "./selector-de-sede"

/*
 * El selector de sede del modal de nueva hora con varias sedes (etapa 9): un
 * `<select>` nativo, con etiqueta visible, obligatorio y sin una sede elegida
 * de antemano. La primera pintura, sin navegador.
 */

const SEDES = [
  { id: "sede-centro", nombre: "Centro" },
  { id: "sede-providencia", nombre: "Providencia" },
]

const pintar = (extra: Partial<Parameters<typeof SelectorDeSede>[0]> = {}) =>
  renderToString(
    createElement(SelectorDeSede, {
      etiqueta: "Sede",
      elegir: "Elige la sede",
      sedes: SEDES,
      value: "",
      onChange: () => {},
      ...extra,
    })
  )

describe("SelectorDeSede", () => {
  it("una etiqueta visible ligada al campo, y el campo es obligatorio", () => {
    const html = pintar()

    const id = /<select[^>]*\bid="([^"]+)"/.exec(html)?.[1]
    expect(id).toBeTruthy()
    expect(html).toContain(`for="${id}"`)
    expect(html).toMatch(/<label[^>]*>Sede<\/label>/)
    expect(html).toMatch(/<select[^>]*\brequired=""/)
  })

  it("sin una elegida, la opción vacía (deshabilitada) obliga a elegir; luego las sedes, en el orden recibido", () => {
    const html = pintar()

    // La vacía queda elegida y deshabilitada: no se puede guardar sin elegir una de verdad.
    expect(html).toContain('<option value="" disabled="" selected="">Elige la sede</option>')
    expect(html.indexOf("Elige la sede")).toBeLessThan(html.indexOf(">Centro<"))
    expect(html.indexOf(">Centro<")).toBeLessThan(html.indexOf(">Providencia<"))
    expect(html).toContain('<option value="sede-centro">Centro</option>')
    expect(html).toContain('<option value="sede-providencia">Providencia</option>')
  })

  it("con una elegida, ésa queda seleccionada", () => {
    const html = pintar({ value: "sede-providencia" })

    expect(html).toMatch(/<option value="sede-providencia" selected="">Providencia<\/option>/)
    expect(html).not.toMatch(/<option value="" disabled="" selected/)
  })

  it("el texto que explica la sede (su horario) se lee junto al campo", () => {
    expect(pintar({ idDeLaAyuda: "horario-de-la-sede" })).toMatch(/<select[^>]*aria-describedby="horario-de-la-sede"/)
    expect(pintar()).not.toContain("aria-describedby")
  })
})
