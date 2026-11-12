import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { SalirDeLaLista } from "./salir-de-la-lista"

const pintar = (rubro?: string | null) =>
  renderToString(createElement(SalirDeLaLista, { slug: "salon-uno", token: "t".repeat(43), rubro }))

describe("SalirDeLaLista: lo que se pierde al salir", () => {
  it("sin rubro, o con uno desconocido: 'una hora', como siempre", () => {
    for (const html of [pintar(), pintar(null), pintar("salud")]) {
      expect(html).toContain("no te vamos a avisar cuando se libere una hora ese día. Tus reservas no cambian.")
    }
  })

  it("con rubro: la hora que se libera, en cualquiera de los rubros", () => {
    for (const rubro of ["salon", "barberia", "spa-de-unas", "odontologia"]) {
      expect(pintar(rubro)).toContain("no te vamos a avisar cuando se libere una hora ese día.")
    }
  })
})
