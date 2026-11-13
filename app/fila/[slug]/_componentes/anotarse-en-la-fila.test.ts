import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }))

/*
 * Fuera del horario, la fila nombra al lugar con la palabra del rubro: "El
 * local" si el rubro no se conoce, "El salón" en un salón. La fila virtual no
 * existe en la clínica dental (la página da 404), así que no se prueba.
 */

async function pintar(rubro?: string | null) {
  const { AnotarseEnLaFila } = await import("./anotarse-en-la-fila")
  const html = renderToString(
    createElement(AnotarseEnLaFila, { slug: "salon-uno", nombreNegocio: "Casa Ana", rubro, abierto: false, esperando: 0, llena: false })
  )
  return html.replace(/<!-- -->/g, "")
}

describe("AnotarseEnLaFila: fuera del horario", () => {
  it("sin rubro, o con uno desconocido: 'El local no está atendiendo en este momento.'", async () => {
    for (const rubro of [undefined, null, "salud"]) {
      expect(await pintar(rubro)).toContain("El local no está atendiendo en este momento.")
    }
  })

  it("con rubro: el salón, la barbería o el salón de uñas, con su artículo", async () => {
    expect(await pintar("salon")).toContain("El salón no está atendiendo en este momento.")
    expect(await pintar("barberia")).toContain("La barbería no está atendiendo en este momento.")
    expect(await pintar("spa-de-unas")).toContain("El salón de uñas no está atendiendo en este momento.")
  })
})
