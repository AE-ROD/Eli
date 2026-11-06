import { describe, expect, it } from "vitest"
import type { MarcaDelOdontograma } from "@/lib/odontograma"
import {
  etiquetaDePieza,
  hallazgosParaLeer,
  marcaDeCara,
  mismasMarcas,
  nombreAccesibleDePieza,
  tieneMarcaDePieza,
  tocarCara,
  tocarPieza,
} from "./marcas"

const caries16O: MarcaDelOdontograma = { pieza: 16, cara: "O", tipo: "caries" }

describe("tocarCara", () => {
  it("con una herramienta de cara, marca la cara", () => {
    expect(tocarCara([], 16, "O", "caries")).toEqual([caries16O])
  })

  it("con la misma herramienta, la desmarca", () => {
    expect(tocarCara([caries16O], 16, "O", "caries")).toEqual([])
  })

  it("con otra herramienta de cara, la cambia: una cara lleva una sola marca", () => {
    const resultado = tocarCara([caries16O], 16, "O", "obturacion")
    expect(resultado).toEqual([{ pieza: 16, cara: "O", tipo: "obturacion" }])
  })

  it("con una herramienta de pieza, pone o saca esa marca en la pieza entera", () => {
    const conCorona = tocarCara([caries16O], 16, "M", "corona")
    expect(tieneMarcaDePieza(conCorona, 16, "corona")).toBe(true)
    expect(marcaDeCara(conCorona, 16, "O")).toBe("caries")
    expect(tieneMarcaDePieza(tocarCara(conCorona, 16, "O", "corona"), 16, "corona")).toBe(false)
  })

  it("Borrar saca sólo la marca de esa cara", () => {
    const marcas: MarcaDelOdontograma[] = [caries16O, { pieza: 16, cara: "M", tipo: "caries" }, { pieza: 16, cara: null, tipo: "corona" }]
    const resultado = tocarCara(marcas, 16, "O", "borrar")
    expect(marcaDeCara(resultado, 16, "O")).toBeNull()
    expect(marcaDeCara(resultado, 16, "M")).toBe("caries")
    expect(tieneMarcaDePieza(resultado, 16, "corona")).toBe(true)
  })

  it("una cara que la pieza no tiene no cambia nada", () => {
    // La 16 es superior (palatina, no lingual) y molar (oclusal, no incisal).
    expect(tocarCara([], 16, "L", "caries")).toEqual([])
    expect(tocarCara([], 11, "O", "caries")).toEqual([])
  })

  it("no toca las otras piezas", () => {
    const otra: MarcaDelOdontograma = { pieza: 26, cara: "O", tipo: "caries" }
    expect(tocarCara([otra], 16, "O", "borrar")).toEqual([otra])
  })
})

describe("tocarPieza", () => {
  it("con una herramienta de cara no cambia nada (sólo se elige la pieza)", () => {
    expect(tocarPieza([caries16O], 16, "caries")).toEqual([caries16O])
  })

  it("con una de pieza, la pone y la saca", () => {
    const ausente = tocarPieza([], 46, "ausente")
    expect(ausente).toEqual([{ pieza: 46, cara: null, tipo: "ausente" }])
    expect(tocarPieza(ausente, 46, "ausente")).toEqual([])
  })

  it("Borrar saca todo lo de la pieza, y nada de las demás", () => {
    const marcas: MarcaDelOdontograma[] = [caries16O, { pieza: 16, cara: null, tipo: "endodoncia" }, { pieza: 17, cara: "O", tipo: "sellante" }]
    expect(tocarPieza(marcas, 16, "borrar")).toEqual([{ pieza: 17, cara: "O", tipo: "sellante" }])
  })
})

describe("mismasMarcas", () => {
  it("compara sin importar el orden", () => {
    const a: MarcaDelOdontograma[] = [caries16O, { pieza: 18, cara: null, tipo: "extraccion" }]
    expect(mismasMarcas(a, [...a].reverse())).toBe(true)
    expect(mismasMarcas(a, [caries16O])).toBe(false)
    expect(mismasMarcas([caries16O], [{ ...caries16O, tipo: "obturacion" }])).toBe(false)
  })
})

describe("textos para leer", () => {
  it("el nombre accesible dice la pieza, su nombre y sus hallazgos", () => {
    const marcas: MarcaDelOdontograma[] = [caries16O, { pieza: 16, cara: "M", tipo: "caries" }, { pieza: 16, cara: null, tipo: "corona" }]
    expect(nombreAccesibleDePieza(16, marcas)).toBe("Pieza 16, primer molar superior derecho: caries oclusal y mesial, corona")
    expect(nombreAccesibleDePieza(21, marcas)).toBe("Pieza 21, incisivo central superior izquierdo: sin hallazgos")
    expect(hallazgosParaLeer(85, [])).toBe("sin hallazgos")
  })

  it("los terceros molares van entre paréntesis; las temporales, no", () => {
    expect(etiquetaDePieza(18)).toBe("(18)")
    expect(etiquetaDePieza(17)).toBe("17")
    expect(etiquetaDePieza(55)).toBe("55")
  })
})
