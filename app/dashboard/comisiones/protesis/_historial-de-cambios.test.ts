import { describe, expect, it } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { CambioDeReparto } from "@/lib/cambios-de-reparto-servidor"
import { vocabularioDe } from "@/lib/vocabulario"
import { filaDelHistorial, frasesDelHistorialDelReparto } from "./_frases"
import { HistorialDeCambiosDelReparto } from "./_historial-de-cambios"

const palabras = vocabularioDe("odontologia").palabras
const frases = frasesDelHistorialDelReparto(palabras)

function cambio(datos: Partial<CambioDeReparto> = {}): CambioDeReparto {
  return {
    id: "c-1",
    cuando: "2026-11-09T17:05:00.000Z",
    alcance: "material",
    material: "Acrílico termocurado",
    profesional: null,
    quien: "Valentina Soto",
    antes: { pbOdontologo: 4000, pbClinica: 3000, pbTecnico: 3000 },
    despues: { pbOdontologo: 3500, pbClinica: 2500, pbTecnico: 4000 },
    ...datos,
  }
}

const dibujar = (cambios: CambioDeReparto[], extra: { hrefDeVerMas?: string | null; topeAlcanzado?: number | null } = {}) =>
  renderToStaticMarkup(
    createElement(HistorialDeCambiosDelReparto, {
      filas: cambios.map((c) => filaDelHistorial(c, "America/Santiago", palabras)),
      frases,
      hrefDeVerMas: null,
      topeAlcanzado: null,
      ...extra,
    })
  )

describe("HistorialDeCambiosDelReparto (lo que se dibuja)", () => {
  it("cada cambio: qué, quién, cuándo y el antes y el después de las tres partes, cada una con su nombre", () => {
    const html = dibujar([cambio()])

    expect(html).toContain("Historial de cambios")
    expect(html).toContain("Acrílico termocurado")
    expect(html).toContain("Valentina Soto cambió la regla")
    expect(html).toContain("9 nov 2026, 14:05")
    expect(html).toContain("Antes")
    expect(html).toContain("Después")
    for (const nombre of ["Tratante", "Clínica", "Laboratorio"]) expect(html).toContain(`${nombre}: `)
    for (const porcentaje of ["40 %", "30 %", "35 %", "25 %"]) expect(html).toContain(porcentaje)
    // Es una lista, y los dos repartos son una lista de definiciones.
    expect(html).toContain("<ol")
    expect(html).toContain("<dl")
  })

  it("una excepción dice de qué odontólogo y de qué material; un cambio sin «antes» dice «No existía»", () => {
    const html = dibujar([cambio({ alcance: "excepcion", profesional: "Diego Pérez", material: "Zirconio", antes: null })])

    expect(html).toContain("Excepción por odontólogo")
    expect(html).toContain("Diego Pérez · Zirconio")
    expect(html).toContain("creó la excepción")
    expect(html).toContain("No existía")
  })

  it("una excepción quitada dice «Se quitó» en el «después»", () => {
    expect(dibujar([cambio({ alcance: "excepcion", profesional: "Diego Pérez", despues: null })])).toContain("Se quitó")
  })

  it("lo que viene de la base se escapa: un nombre con HTML se ve como texto, no se interpreta", () => {
    const html = dibujar([cambio({ material: "<img src=x onerror=alert(1)>", quien: "<script>alert(1)</script>" })])

    expect(html).not.toContain("<img")
    expect(html).not.toContain("<script")
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;")
  })

  it("sin cambios, el estado vacío con su frase", () => {
    const html = dibujar([])

    expect(html).toContain("Todavía no hay cambios")
    expect(html).not.toContain("<ol")
  })

  it("«Ver más cambios» es un enlace a la misma página con más filas; sin más, no hay enlace", () => {
    const con = dibujar([cambio()], { hrefDeVerMas: "/dashboard/comisiones/protesis?hasta=100" })
    expect(con).toContain('href="/dashboard/comisiones/protesis?hasta=100"')
    expect(con).toContain("Ver más cambios")

    const sin = dibujar([cambio()])
    expect(sin).not.toContain("Ver más cambios")
  })

  it("al llegar al tope, lo avisa", () => {
    expect(dibujar([cambio()], { topeAlcanzado: 500 })).toContain("Se muestran los últimos 500 cambios.")
  })
})
