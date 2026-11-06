import { describe, it, expect } from "vitest"
import {
  CARAS,
  abreviaturaDeCaras,
  carasDe,
  cuadranteDe,
  denticionDe,
  errorDeMarca,
  esDelMaxilar,
  esMarcaValida,
  esPiezaValida,
  hallazgosPorPieza,
  nombreDeCara,
  nombreDePieza,
  nombreDeTipo,
  ordenarCaras,
  piezasDe,
  piezasDelCuadrante,
  posicionDe,
  resumenDelOdontograma,
  sonCarasValidas,
  textoDeCaras,
  textoDeHallazgos,
  type MarcaDelOdontograma,
} from "./odontograma"

/** Las piezas FDI, escritas a mano: la lista contra la que se comparan las funciones. */
const PERMANENTES = [
  11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28,
  31, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48,
]
const TEMPORALES = [51, 52, 53, 54, 55, 61, 62, 63, 64, 65, 71, 72, 73, 74, 75, 81, 82, 83, 84, 85]

describe("piezas", () => {
  it("la dentición permanente son 32 piezas, cuadrante por cuadrante", () => {
    expect(piezasDe("permanente")).toEqual(PERMANENTES)
  })

  it("la temporal son 20, en los cuadrantes 5 a 8", () => {
    expect(piezasDe("temporal")).toEqual(TEMPORALES)
  })

  it("un cuadrante va desde la línea media hacia atrás; uno que no existe, vacío", () => {
    expect(piezasDelCuadrante(2)).toEqual([21, 22, 23, 24, 25, 26, 27, 28])
    expect(piezasDelCuadrante(7)).toEqual([71, 72, 73, 74, 75])
    expect(piezasDelCuadrante(0)).toEqual([])
    expect(piezasDelCuadrante(9)).toEqual([])
  })

  it("son válidas exactamente las 52 piezas FDI", () => {
    const validas = Array.from({ length: 100 }, (_, n) => n).filter(esPiezaValida)
    expect(validas).toEqual([...PERMANENTES, ...TEMPORALES])
  })

  it.each([10, 19, 20, 29, 56, 60, 66, 86, 90, 91, 0, -16, 16.5, "16", null, undefined, Number.NaN])(
    "%j no es una pieza",
    (pieza) => {
      expect(esPiezaValida(pieza)).toBe(false)
    }
  )

  it("cuadrante, posición, dentición y arcada", () => {
    expect(cuadranteDe(46)).toBe(4)
    expect(posicionDe(46)).toBe(6)
    expect(denticionDe(46)).toBe("permanente")
    expect(denticionDe(55)).toBe("temporal")
    expect([16, 26, 55, 65].every(esDelMaxilar)).toBe(true)
    expect([36, 46, 75, 85].some(esDelMaxilar)).toBe(false)
  })
})

describe("nombreDePieza", () => {
  it.each([
    [16, "Primer molar superior derecho"],
    [11, "Incisivo central superior derecho"],
    [22, "Incisivo lateral superior izquierdo"],
    [33, "Canino inferior izquierdo"],
    [44, "Primer premolar inferior derecho"],
    [25, "Segundo premolar superior izquierdo"],
    [37, "Segundo molar inferior izquierdo"],
    [18, "Tercer molar superior derecho"],
    [48, "Tercer molar inferior derecho"],
    [55, "Segundo molar temporal superior derecho"],
    [61, "Incisivo central temporal superior izquierdo"],
    [73, "Canino temporal inferior izquierdo"],
    [84, "Primer molar temporal inferior derecho"],
  ])("la %i es %s", (pieza, nombre) => {
    expect(nombreDePieza(pieza)).toBe(nombre)
  })

  it("toda pieza válida tiene nombre, y no se repiten", () => {
    const nombres = [...PERMANENTES, ...TEMPORALES].map(nombreDePieza)
    expect(nombres.every((nombre) => nombre !== "Pieza desconocida")).toBe(true)
    expect(new Set(nombres).size).toBe(nombres.length)
  })

  it("una pieza que no existe no rompe", () => {
    expect(nombreDePieza(19)).toBe("Pieza desconocida")
    expect(nombreDePieza(56)).toBe("Pieza desconocida")
  })
})

describe("caras", () => {
  it.each([
    [16, ["O", "M", "D", "V", "P"]],
    [11, ["I", "M", "D", "V", "P"]],
    [13, ["I", "M", "D", "V", "P"]],
    [14, ["O", "M", "D", "V", "P"]],
    [36, ["O", "M", "D", "V", "L"]],
    [41, ["I", "M", "D", "V", "L"]],
    [53, ["I", "M", "D", "V", "P"]],
    [54, ["O", "M", "D", "V", "P"]],
    [74, ["O", "M", "D", "V", "L"]],
  ])("la %i tiene las caras %j", (pieza, caras) => {
    expect(carasDe(pieza)).toEqual(caras)
  })

  it("toda pieza tiene cinco caras; una que no existe, ninguna", () => {
    for (const pieza of [...PERMANENTES, ...TEMPORALES]) expect(carasDe(pieza)).toHaveLength(5)
    expect(carasDe(19)).toEqual([])
  })

  it("nombres, orden y abreviatura", () => {
    expect(CARAS.map(nombreDeCara)).toEqual(["oclusal", "incisal", "mesial", "distal", "vestibular", "palatina", "lingual"])
    expect(nombreDeCara("X")).toBe("cara desconocida")
    expect(ordenarCaras(["M", "O", "M", "X", null])).toEqual(["O", "M"])
    expect(textoDeCaras(["M", "O"])).toBe("oclusal y mesial")
    expect(textoDeCaras(["D", "M", "O"])).toBe("oclusal, mesial y distal")
    expect(textoDeCaras(["V"])).toBe("vestibular")
    expect(textoDeCaras([])).toBe("")
    expect(abreviaturaDeCaras(["M", "O"])).toBe("OM")
  })

  describe("sonCarasValidas (prestaciones del plan)", () => {
    it.each([
      [null, [], true],
      [null, ["O"], false],
      [16, [], true],
      [16, ["O", "M"], true],
      [16, ["O", "O"], false],
      [16, ["L"], false],
      [16, ["I"], false],
      [36, ["L", "O"], true],
      [11, ["I", "P"], true],
      [11, ["O"], false],
      [19, [], false],
      [16, ["X"], false],
    ] as const)("pieza %j con %j: %j", (pieza, caras, esperado) => {
      expect(sonCarasValidas(pieza, caras)).toBe(esperado)
    })
  })
})

describe("errorDeMarca (las mismas reglas que los CHECKs)", () => {
  it.each([
    [{ pieza: 16, cara: "O", tipo: "caries" }],
    [{ pieza: 16, cara: "M", tipo: "obturacion" }],
    [{ pieza: 24, cara: "O", tipo: "sellante" }],
    [{ pieza: 21, cara: null, tipo: "corona" }],
    [{ pieza: 36, cara: null, tipo: "endodoncia" }],
    [{ pieza: 46, cara: null, tipo: "ausente" }],
    [{ pieza: 18, cara: null, tipo: "extraccion" }],
    [{ pieza: 63, cara: "P", tipo: "caries" }],
    [{ pieza: 74, cara: "L", tipo: "caries" }],
    [{ pieza: 41, cara: "I", tipo: "obturacion" }],
    [{ pieza: 54, cara: "O", tipo: "caries" }],
    [{ pieza: 85, cara: null, tipo: "ausente" }],
  ])("%j es válida", (marca) => {
    expect(errorDeMarca(marca)).toBeNull()
    expect(esMarcaValida(marca)).toBe(true)
  })

  it.each([
    ["pieza 19", { pieza: 19, cara: null, tipo: "ausente" }, "Esa pieza no existe en el odontograma."],
    ["pieza 56", { pieza: 56, cara: null, tipo: "ausente" }, "Esa pieza no existe en el odontograma."],
    ["pieza como texto", { pieza: "16", cara: "O", tipo: "caries" }, "Esa pieza no existe en el odontograma."],
    ["tipo inventado", { pieza: 16, cara: "O", tipo: "fractura" }, "Esa marca no existe en el odontograma."],
    ["caries sin cara", { pieza: 16, cara: null, tipo: "caries" }, "Caries va en una cara de la pieza."],
    ["corona con cara", { pieza: 21, cara: "V", tipo: "corona" }, "Corona es de la pieza entera, sin cara."],
    ["extracción con cara", { pieza: 18, cara: "O", tipo: "extraccion" }, "Extracción indicada es de la pieza entera, sin cara."],
    ["cara X", { pieza: 16, cara: "X", tipo: "caries" }, "Esa cara no existe."],
    ["cara en minúscula", { pieza: 16, cara: "o", tipo: "caries" }, "Esa cara no existe."],
    ["palatina en la mandíbula", { pieza: 36, cara: "P", tipo: "caries" }, "La pieza 36 no tiene cara palatina."],
    ["lingual en el maxilar", { pieza: 26, cara: "L", tipo: "caries" }, "La pieza 26 no tiene cara lingual."],
    ["incisal en un molar", { pieza: 46, cara: "I", tipo: "caries" }, "La pieza 46 no tiene cara incisal."],
    ["oclusal en un canino", { pieza: 13, cara: "O", tipo: "caries" }, "La pieza 13 no tiene cara oclusal."],
    ["oclusal en un canino temporal", { pieza: 53, cara: "O", tipo: "sellante" }, "La pieza 53 no tiene cara oclusal."],
  ])("%s: %j", (_caso, marca, error) => {
    expect(errorDeMarca(marca)).toBe(error)
    expect(esMarcaValida(marca)).toBe(false)
  })

  it("nombres de los tipos", () => {
    expect(nombreDeTipo("extraccion")).toBe("Extracción indicada")
    expect(nombreDeTipo("obturacion")).toBe("Obturación")
    expect(nombreDeTipo("constructor")).toBe("Marca desconocida")
  })
})

/** El odontograma del diseño de la ficha (Camila Rojas). */
const MARCAS: MarcaDelOdontograma[] = [
  { pieza: 18, cara: null, tipo: "extraccion" },
  { pieza: 16, cara: "M", tipo: "caries" },
  { pieza: 16, cara: "O", tipo: "caries" },
  { pieza: 14, cara: "D", tipo: "obturacion" },
  { pieza: 11, cara: "M", tipo: "caries" },
  { pieza: 21, cara: null, tipo: "corona" },
  { pieza: 24, cara: "O", tipo: "sellante" },
  { pieza: 25, cara: "O", tipo: "obturacion" },
  { pieza: 26, cara: "O", tipo: "obturacion" },
  { pieza: 26, cara: "D", tipo: "obturacion" },
  { pieza: 27, cara: "O", tipo: "caries" },
  { pieza: 36, cara: null, tipo: "endodoncia" },
  { pieza: 36, cara: null, tipo: "corona" },
  { pieza: 37, cara: "O", tipo: "obturacion" },
  { pieza: 46, cara: null, tipo: "ausente" },
  { pieza: 55, cara: "O", tipo: "caries" },
]

describe("resumen y hallazgos", () => {
  it("cuenta caras con caries, caras obturadas, ausentes y por extraer", () => {
    expect(resumenDelOdontograma(MARCAS)).toEqual({ carasConCaries: 5, carasObturadas: 5, piezasAusentes: 1, porExtraer: 1 })
  })

  it("con dentición, sólo la que se mira", () => {
    expect(resumenDelOdontograma(MARCAS, "permanente")).toEqual({ carasConCaries: 4, carasObturadas: 5, piezasAusentes: 1, porExtraer: 1 })
    expect(resumenDelOdontograma(MARCAS, "temporal")).toEqual({ carasConCaries: 1, carasObturadas: 0, piezasAusentes: 0, porExtraer: 0 })
  })

  it("una marca inválida no cuenta", () => {
    expect(resumenDelOdontograma([{ pieza: 36, cara: "P", tipo: "caries" }, { pieza: 19, cara: null, tipo: "ausente" }])).toEqual({
      carasConCaries: 0,
      carasObturadas: 0,
      piezasAusentes: 0,
      porExtraer: 0,
    })
  })

  it("el texto de una pieza: caras primero, en orden, y después la pieza", () => {
    expect(textoDeHallazgos(16, MARCAS)).toBe("Caries oclusal y mesial")
    expect(textoDeHallazgos(26, MARCAS)).toBe("Obturación oclusal y distal")
    expect(textoDeHallazgos(36, MARCAS)).toBe("Corona · Endodoncia")
    expect(textoDeHallazgos(18, MARCAS)).toBe("Extracción indicada")
    expect(textoDeHallazgos(17, MARCAS)).toBe("")
    expect(
      textoDeHallazgos(46, [
        { pieza: 46, cara: null, tipo: "ausente" },
        { pieza: 46, cara: "V", tipo: "sellante" },
        { pieza: 46, cara: "O", tipo: "caries" },
        { pieza: 46, cara: "M", tipo: "obturacion" },
        { pieza: 46, cara: null, tipo: "extraccion" },
      ])
    ).toBe("Caries oclusal · Obturación mesial · Sellante vestibular · Extracción indicada · Ausente")
  })

  it("los hallazgos por pieza, de menor a mayor", () => {
    expect(hallazgosPorPieza(MARCAS)).toEqual([
      { pieza: 11, texto: "Caries mesial" },
      { pieza: 14, texto: "Obturación distal" },
      { pieza: 16, texto: "Caries oclusal y mesial" },
      { pieza: 18, texto: "Extracción indicada" },
      { pieza: 21, texto: "Corona" },
      { pieza: 24, texto: "Sellante oclusal" },
      { pieza: 25, texto: "Obturación oclusal" },
      { pieza: 26, texto: "Obturación oclusal y distal" },
      { pieza: 27, texto: "Caries oclusal" },
      { pieza: 36, texto: "Corona · Endodoncia" },
      { pieza: 37, texto: "Obturación oclusal" },
      { pieza: 46, texto: "Ausente" },
      { pieza: 55, texto: "Caries oclusal" },
    ])
  })
})
