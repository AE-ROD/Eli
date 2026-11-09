import { describe, expect, it } from "vitest"
import { comisionEnCentavos } from "@/lib/comisiones"
import {
  MATERIALES_INICIALES,
  ESTADOS_DE_PROTESIS,
  GRUPOS_DE_TONOS,
  IDS_DE_TIPOS,
  MENSAJE_PASO_DE_OTRO_TIPO,
  MENSAJE_PROTESIS_CERRADA,
  MENSAJE_SOLO_AVANZA,
  TONOS_VITA,
  errorDeCambioDeEstado,
  errorDeTiposDelMaterial,
  errorDelDiseno,
  esCordal,
  esMaterialCompatible,
  esPasoDelTipo,
  esPiezaDeLaArcada,
  esRepartoValido,
  esTonoVita,
  estaCerrada,
  etapasDeLaProtesis,
  etiquetaDeTono,
  llevaBase,
  materialesDeProtesisDeEjemplo,
  nombreDeEstado,
  nombreDeTipo,
  nombreParaElPlan,
  normalizarDiseno,
  ordenarTipos,
  pasoSiguiente,
  pasosDelTipo,
  piezasDeLaArcada,
  piezasProtesicasDeLaArcada,
  repartirMonto,
  repartoEfectivo,
  repartoQueAplica,
  textoDePorcentaje,
  textoDeUnidades,
  tiposDeLaUnidad,
  tonoDeLaGuia,
  unidadDelTipo,
  unidadesDe,
  valorDeLaProtesis,
  zonasPermitidas,
  type DisenoDeProtesis,
  type RepartoEnPuntosBase,
} from "./protesis"

const removible = (cambios: Partial<DisenoDeProtesis> = {}): DisenoDeProtesis => ({
  tipo: "removible",
  arcada: "inferior",
  piezas: [46],
  pilares: [45, 47],
  zonas: ["lingual"],
  ...cambios,
})

describe("tipos y materiales", () => {
  it("removible y total se cobran por arcada; fija, implante y corona por pieza", () => {
    expect(unidadDelTipo("removible")).toBe("arcada")
    expect(unidadDelTipo("total")).toBe("arcada")
    expect(unidadDelTipo("fija")).toBe("pieza")
    expect(unidadDelTipo("implante")).toBe("pieza")
    expect(unidadDelTipo("corona")).toBe("pieza")
    expect(tiposDeLaUnidad("arcada")).toEqual(["removible", "total"])
    expect(tiposDeLaUnidad("pieza")).toEqual(["fija", "implante", "corona"])
  })

  it("sólo removible y total llevan base", () => {
    expect(llevaBase("removible")).toBe(true)
    expect(llevaBase("total")).toBe(true)
    expect(llevaBase("fija")).toBe(false)
    expect(llevaBase("corona")).toBe(false)
  })

  it("los tipos de un material tienen que ser de su unidad, sin repetir y al menos uno", () => {
    expect(errorDeTiposDelMaterial("arcada", ["removible", "total"])).toBeNull()
    expect(errorDeTiposDelMaterial("pieza", ["corona"])).toBeNull()
    expect(errorDeTiposDelMaterial("arcada", ["fija"])).toMatch(/removible o total/)
    expect(errorDeTiposDelMaterial("pieza", ["total"])).toMatch(/fija, sobre implantes o corona/)
    expect(errorDeTiposDelMaterial("arcada", [])).toMatch(/al menos un tipo/)
    expect(errorDeTiposDelMaterial("arcada", ["removible", "removible"])).toMatch(/repetido/)
  })

  it("ordena los tipos como el catálogo", () => {
    expect(ordenarTipos(["corona", "fija", "otro"])).toEqual(["fija", "corona"])
  })

  it("un material sirve para un tipo si está activo, es de su unidad y lo tiene en la lista", () => {
    const acrilico = { tipos: ["removible", "total"], unidad: "arcada", activo: true }
    expect(esMaterialCompatible(acrilico, "removible")).toBe(true)
    expect(esMaterialCompatible(acrilico, "fija")).toBe(false)
    expect(esMaterialCompatible({ ...acrilico, activo: false }, "removible")).toBe(false)
    // Un dato inconsistente (tipo de pieza con unidad arcada) no se ofrece.
    expect(esMaterialCompatible({ tipos: ["corona"], unidad: "arcada", activo: true }, "corona")).toBe(false)
  })

  it("nombres", () => {
    expect(nombreDeTipo("removible")).toBe("Removible parcial")
    expect(nombreDeTipo("nada")).toBe("Prótesis")
    expect(ESTADOS_DE_PROTESIS.map((estado) => nombreDeEstado(estado.id))).toEqual([
      "Toma de impresión",
      "Prueba de rodete",
      "Prueba de enfilado",
      "Prueba",
      "Entregada",
      "Anulada",
    ])
    expect(nombreDeEstado("en-laboratorio")).toBe("Estado desconocido")
  })
})

describe("el diseño sobre la arcada", () => {
  it("las piezas de cada arcada son las permanentes de sus cuadrantes", () => {
    expect(piezasDeLaArcada("superior")).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28])
    expect(piezasDeLaArcada("inferior")).toEqual([31, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48])
    expect(piezasDeLaArcada("ambas")).toHaveLength(32)
    expect(esPiezaDeLaArcada(46, "inferior")).toBe(true)
    expect(esPiezaDeLaArcada(16, "inferior")).toBe(false)
    expect(esPiezaDeLaArcada(84, "inferior")).toBe(false)
    expect(esPiezaDeLaArcada(84, "ambas")).toBe(false)
  })

  it("los cordales (x8) no son piezas protésicas: la arcada que se marca tiene 14, o 28 con Ambas", () => {
    expect([18, 28, 38, 48].every(esCordal)).toBe(true)
    expect([17, 47, 58, 8].some(esCordal)).toBe(false)
    expect(piezasProtesicasDeLaArcada("superior")).toEqual([11, 12, 13, 14, 15, 16, 17, 21, 22, 23, 24, 25, 26, 27])
    expect(piezasProtesicasDeLaArcada("inferior")).toEqual([31, 32, 33, 34, 35, 36, 37, 41, 42, 43, 44, 45, 46, 47])
    expect(piezasProtesicasDeLaArcada("ambas")).toHaveLength(28)
  })

  it("acepta una removible inferior con pieza, pilares y barra lingual", () => {
    expect(errorDelDiseno(removible())).toBeNull()
  })

  it.each([
    ["una pieza de la otra arcada", removible({ piezas: [16] }), /no es de la arcada inferior/],
    ["una pieza temporal", removible({ piezas: [84] }), /dentición permanente/],
    ["una pieza que no existe", removible({ piezas: [49] }), /dentición permanente/],
    ["un cordal como pieza protésica", removible({ piezas: [46, 48] }), /48 es un cordal/],
    ["un cordal como pilar (gancho)", removible({ pilares: [45, 47, 38] }), /38 es un cordal/],
    ["un cordal en una fija", { tipo: "fija", arcada: "superior", piezas: [17], pilares: [16, 18], zonas: [] }, /18 es un cordal/],
    ["una corona en un cordal", { tipo: "corona", arcada: "superior", piezas: [28], pilares: [], zonas: [] }, /28 es un cordal/],
    ["una total con cordales", { tipo: "total", arcada: "superior", piezas: piezasDeLaArcada("superior"), pilares: [], zonas: [] }, /18 es un cordal/],
    ["un pilar fuera de la arcada", removible({ pilares: [15] }), /no es de la arcada inferior/],
    ["una pieza repetida", removible({ piezas: [46, 46] }), /dos veces/],
    ["una pieza protésica que también es pilar", removible({ pilares: [46] }), /a la vez protésica y pilar/],
    ["sin piezas protésicas", removible({ piezas: [] }), /al menos una pieza/],
    ["ambas con piezas sólo abajo", removible({ arcada: "ambas", zonas: [] }), /arriba y abajo/],
    ["paladar en la inferior", removible({ zonas: ["paladar"] }), /paladar es de la arcada superior/],
    ["barra lingual en la superior", removible({ arcada: "superior", piezas: [16], pilares: [15, 17] }), /barra lingual es de la arcada inferior/],
    ["una zona que no existe", removible({ zonas: ["encia"] }), /no existe/],
    ["una zona repetida", removible({ zonas: ["flanco", "flanco"] }), /repetida/],
    ["zonas en una fija", removible({ tipo: "fija" }), /no llevan base/],
    ["zonas en una corona", { tipo: "corona", arcada: "superior", piezas: [21], pilares: [], zonas: ["rebasado"] }, /no llevan base/],
    ["una corona de dos piezas", { tipo: "corona", arcada: "superior", piezas: [21, 22], pilares: [], zonas: [] }, /una sola pieza/],
    ["una corona con pilar", { tipo: "corona", arcada: "superior", piezas: [21], pilares: [22], zonas: [] }, /una sola pieza/],
    ["una corona en ambas", { tipo: "corona", arcada: "ambas", piezas: [21, 31], pilares: [], zonas: [] }, /una sola arcada/],
    ["una total sin todas las piezas", { tipo: "total", arcada: "superior", piezas: [11], pilares: [], zonas: [] }, /todas las piezas/],
    ["una total con pilares", { tipo: "total", arcada: "superior", piezas: piezasProtesicasDeLaArcada("superior").slice(1), pilares: [11], zonas: [] }, /no lleva pilares/],
  ] as [string, DisenoDeProtesis, RegExp][])("rechaza %s", (_caso, diseno, error) => {
    expect(errorDelDiseno(diseno)).toMatch(error)
  })

  it("una fija con pónticos y pilares, sin zonas, pasa; y una de ambas arcadas con piezas arriba y abajo", () => {
    expect(errorDelDiseno({ tipo: "fija", arcada: "superior", piezas: [12], pilares: [11, 13], zonas: [] })).toBeNull()
    expect(errorDelDiseno({ tipo: "removible", arcada: "ambas", piezas: [16, 46], pilares: [], zonas: ["paladar", "lingual"] })).toBeNull()
  })

  it("zonas permitidas según tipo y arcada", () => {
    expect(zonasPermitidas("removible", "superior")).toEqual(["paladar", "flanco", "rebasado", "reparacion"])
    expect(zonasPermitidas("total", "inferior")).toEqual(["lingual", "flanco", "rebasado", "reparacion"])
    expect(zonasPermitidas("removible", "ambas")).toEqual(["paladar", "lingual", "flanco", "rebasado", "reparacion"])
    expect(zonasPermitidas("fija", "ambas")).toEqual([])
  })

  it("normalizar: la total marca todas las piezas de la arcada menos los cordales, sin pilares, aunque manden otras", () => {
    const total = normalizarDiseno({ tipo: "total", arcada: "superior", piezas: [11, 18], pilares: [12], zonas: ["paladar"] })
    expect(total.piezas).toEqual([11, 12, 13, 14, 15, 16, 17, 21, 22, 23, 24, 25, 26, 27])
    expect(total.pilares).toEqual([])
    expect(errorDelDiseno(total)).toBeNull()
    const ambas = normalizarDiseno({ tipo: "total", arcada: "ambas", piezas: [], pilares: [], zonas: [] })
    expect(ambas.piezas).toHaveLength(28)
    expect(ambas.piezas.some(esCordal)).toBe(false)
  })

  it("normalizar: ordena piezas y pilares y deja las zonas en el orden del catálogo, sin perder las desconocidas", () => {
    const normal = normalizarDiseno(removible({ piezas: [47, 46], pilares: [45, 44], zonas: ["rebasado", "lingual", "encia"] }))
    expect(normal.piezas).toEqual([46, 47])
    expect(normal.pilares).toEqual([44, 45])
    expect(normal.zonas).toEqual(["lingual", "rebasado", "encia"])
    expect(errorDelDiseno(normal)).toMatch(/no existe/)
  })
})

describe("unidades y precio", () => {
  it("por arcada: 1, o 2 con Ambas; por pieza: protésicas más pilares", () => {
    expect(unidadesDe("arcada", removible())).toBe(1)
    expect(unidadesDe("arcada", removible({ arcada: "ambas" }))).toBe(2)
    expect(unidadesDe("pieza", removible())).toBe(3)
    expect(unidadesDe("pieza", { arcada: "superior", piezas: [21], pilares: [] })).toBe(1)
  })

  it("el valor es precio por unidades", () => {
    expect(valorDeLaProtesis({ unidad: "arcada", precioCents: 18_000_000 }, removible())).toEqual({
      ok: true,
      unidades: 1,
      valorCents: 18_000_000,
    })
    expect(valorDeLaProtesis({ unidad: "pieza", precioCents: 29_000_000 }, removible())).toEqual({
      ok: true,
      unidades: 3,
      valorCents: 87_000_000,
    })
  })

  it("sobre el tope, error en vez de truncar", () => {
    const resultado = valorDeLaProtesis({ unidad: "pieza", precioCents: 1_000_000_000 }, removible())
    expect(resultado.ok).toBe(false)
  })

  it("texto de unidades", () => {
    expect(textoDeUnidades("arcada", 1)).toBe("1 arcada")
    expect(textoDeUnidades("arcada", 2)).toBe("2 arcadas")
    expect(textoDeUnidades("pieza", 3)).toBe("3 piezas")
  })
})

describe("el reparto", () => {
  const acrilico: RepartoEnPuntosBase = { pbOdontologo: 4000, pbClinica: 3000, pbTecnico: 3000 }
  const excepcion: RepartoEnPuntosBase = { pbOdontologo: 5000, pbClinica: 2000, pbTecnico: 3000 }

  it("válido: tres enteros de 0 a 10.000 que suman 10.000", () => {
    expect(esRepartoValido(acrilico)).toBe(true)
    expect(esRepartoValido({ pbOdontologo: 0, pbClinica: 10_000, pbTecnico: 0 })).toBe(true)
    expect(esRepartoValido({ pbOdontologo: 4000, pbClinica: 3000, pbTecnico: 2999 })).toBe(false)
    expect(esRepartoValido({ pbOdontologo: 4000.5, pbClinica: 2999.5, pbTecnico: 3000 })).toBe(false)
    expect(esRepartoValido({ pbOdontologo: -1, pbClinica: 7001, pbTecnico: 3000 })).toBe(false)
    expect(esRepartoValido({ pbOdontologo: 4000, pbClinica: 3000 })).toBe(false)
  })

  it("la excepción de la tratante manda sobre la regla del material", () => {
    expect(repartoQueAplica(acrilico, excepcion)).toEqual({ ...excepcion, origen: "excepcion" })
    expect(repartoQueAplica(acrilico, null)).toEqual({ ...acrilico, origen: "material" })
    expect(repartoQueAplica({ ...acrilico, id: "x" } as RepartoEnPuntosBase, undefined)).toEqual({ ...acrilico, origen: "material" })
  })

  it("si la tratante es la dueña, su parte va a la clínica", () => {
    expect(repartoEfectivo(acrilico, true)).toEqual({ pbOdontologo: 0, pbClinica: 7000, pbTecnico: 3000 })
    expect(repartoEfectivo(acrilico, false)).toEqual(acrilico)
  })

  it("reparte el valor al centavo: odontóloga y técnico con comisionEnCentavos, clínica el resto", () => {
    expect(repartirMonto(18_000_000, acrilico, false)).toEqual({ odontologoCents: 7_200_000, clinicaCents: 5_400_000, tecnicoCents: 5_400_000 })
    // Un monto que no divide exacto: las tres suman el monto.
    const tercios = { pbOdontologo: 3333, pbClinica: 3334, pbTecnico: 3333 }
    const partes = repartirMonto(1_000_001, tercios, false)
    expect(partes.odontologoCents).toBe(comisionEnCentavos(1_000_001, 33.33))
    expect(partes.tecnicoCents).toBe(comisionEnCentavos(1_000_001, 33.33))
    expect(partes.odontologoCents + partes.clinicaCents + partes.tecnicoCents).toBe(1_000_001)
  })

  it("con la dueña de tratante, la odontóloga queda en 0 y la clínica lleva su parte", () => {
    expect(repartirMonto(18_000_000, acrilico, true)).toEqual({ odontologoCents: 0, clinicaCents: 12_600_000, tecnicoCents: 5_400_000 })
  })

  it("la clínica nunca queda negativa por redondeo: el técnico cede el centavo", () => {
    const sinClinica = { pbOdontologo: 5000, pbClinica: 0, pbTecnico: 5000 }
    expect(repartirMonto(1, sinClinica, false)).toEqual({ odontologoCents: 1, clinicaCents: 0, tecnicoCents: 0 })
    for (const monto of [1, 3, 99, 101, 12_345]) {
      const partes = repartirMonto(monto, sinClinica, false)
      expect(partes.clinicaCents).toBeGreaterThanOrEqual(0)
      expect(partes.odontologoCents + partes.clinicaCents + partes.tecnicoCents).toBe(monto)
    }
  })

  it("con un reparto inválido, lanza", () => {
    expect(() => repartirMonto(100, { pbOdontologo: 1, pbClinica: 1, pbTecnico: 1 }, false)).toThrow(RangeError)
  })

  it("texto del porcentaje", () => {
    expect(textoDePorcentaje(4000)).toBe("40 %")
    expect(textoDePorcentaje(3333)).toBe("33,33 %")
    expect(textoDePorcentaje(4050)).toBe("40,5 %")
    expect(textoDePorcentaje(4005)).toBe("40,05 %")
  })
})

describe("el seguimiento", () => {
  it("cada tipo tiene sus etapas: removible y total con rodete y enfilado; fija, corona e implante con una prueba", () => {
    expect(pasosDelTipo("removible")).toEqual(["impresion", "rodete", "enfilado", "entregada"])
    expect(pasosDelTipo("total")).toEqual(["impresion", "rodete", "enfilado", "entregada"])
    for (const tipo of ["fija", "corona", "implante"] as const) expect(pasosDelTipo(tipo)).toEqual(["impresion", "prueba", "entregada"])
    // Ningún tipo pasa por un laboratorio como paso, y todos empiezan y terminan igual.
    for (const tipo of IDS_DE_TIPOS) {
      expect(pasosDelTipo(tipo)[0]).toBe("impresion")
      expect(pasosDelTipo(tipo).at(-1)).toBe("entregada")
    }
    expect(esPasoDelTipo("fija", "rodete")).toBe(false)
    expect(esPasoDelTipo("total", "prueba")).toBe(false)
    expect(esPasoDelTipo("removible", "anulada")).toBe(false)
    // Una copia: no se toca el catálogo.
    pasosDelTipo("corona").push("rodete")
    expect(pasosDelTipo("corona")).toEqual(["impresion", "prueba", "entregada"])
  })

  it("el paso siguiente según el tipo, hasta entregada", () => {
    expect(pasosDelTipo("removible").map((paso) => pasoSiguiente("removible", paso))).toEqual(["rodete", "enfilado", "entregada", null])
    expect(pasosDelTipo("corona").map((paso) => pasoSiguiente("corona", paso))).toEqual(["prueba", "entregada", null])
    expect(pasoSiguiente("fija", "anulada")).toBeNull()
    expect(pasoSiguiente("fija", "rodete")).toBeNull()
  })

  it("sólo hacia adelante por los pasos del tipo, se puede saltar un paso, y anular antes de entregar; sin pedir laboratorio", () => {
    expect(errorDeCambioDeEstado("removible", "impresion", "rodete")).toBeNull()
    expect(errorDeCambioDeEstado("total", "impresion", "entregada")).toBeNull()
    expect(errorDeCambioDeEstado("fija", "impresion", "prueba")).toBeNull()
    expect(errorDeCambioDeEstado("removible", "enfilado", "rodete")).toBe(MENSAJE_SOLO_AVANZA)
    expect(errorDeCambioDeEstado("corona", "prueba", "prueba")).toBe(MENSAJE_SOLO_AVANZA)
    expect(errorDeCambioDeEstado("implante", "prueba", "impresion")).toBe(MENSAJE_SOLO_AVANZA)
    expect(errorDeCambioDeEstado("fija", "impresion", "rodete")).toBe(MENSAJE_PASO_DE_OTRO_TIPO)
    expect(errorDeCambioDeEstado("removible", "impresion", "prueba")).toBe(MENSAJE_PASO_DE_OTRO_TIPO)
    expect(errorDeCambioDeEstado("removible", "impresion", "anulada")).toBeNull()
    expect(errorDeCambioDeEstado("corona", "prueba", "anulada")).toBeNull()
  })

  it("entregada y anulada no cambian más", () => {
    expect(estaCerrada("entregada")).toBe(true)
    expect(estaCerrada("anulada")).toBe(true)
    expect(estaCerrada("prueba")).toBe(false)
    expect(errorDeCambioDeEstado("fija", "entregada", "anulada")).toBe(MENSAJE_PROTESIS_CERRADA)
    expect(errorDeCambioDeEstado("removible", "anulada", "entregada")).toBe(MENSAJE_PROTESIS_CERRADA)
  })

  describe("las etapas para la pantalla", () => {
    const evento = (estado: string, createdAt: string, autorNombre = "Ana") => ({ estado, autorNombre, createdAt })

    it("en curso: hechas con su fecha y autor, la actual, y las pendientes", () => {
      const etapas = etapasDeLaProtesis("removible", "rodete", [evento("impresion", "d1"), evento("rodete", "d2", "Beto")])
      expect(etapas).toEqual([
        { id: "impresion", nombre: "Toma de impresión", situacion: "hecha", fecha: "d1", autorNombre: "Ana" },
        { id: "rodete", nombre: "Prueba de rodete", situacion: "actual", fecha: "d2", autorNombre: "Beto" },
        { id: "enfilado", nombre: "Prueba de enfilado", situacion: "pendiente", fecha: null, autorNombre: null },
        { id: "entregada", nombre: "Entregada", situacion: "pendiente", fecha: null, autorNombre: null },
      ])
    })

    it("un paso saltado queda como saltada; entregada, todo hecho", () => {
      const etapas = etapasDeLaProtesis("total", "entregada", [evento("impresion", "d1"), evento("entregada", "d3")])
      expect(etapas.map((etapa) => [etapa.id, etapa.situacion, etapa.fecha])).toEqual([
        ["impresion", "hecha", "d1"],
        ["rodete", "saltada", null],
        ["enfilado", "saltada", null],
        ["entregada", "hecha", "d3"],
      ])
    })

    it("anulada: hasta donde llegó, sin actual; el resto pendiente", () => {
      const etapas = etapasDeLaProtesis("corona", "anulada", [evento("impresion", "d1"), evento("prueba", "d2"), evento("anulada", "d3")])
      expect(etapas.map((etapa) => [etapa.id, etapa.situacion])).toEqual([
        ["impresion", "hecha"],
        ["prueba", "hecha"],
        ["entregada", "pendiente"],
      ])
      expect(etapasDeLaProtesis("fija", "anulada", [evento("anulada", "d1")]).map((etapa) => etapa.situacion)).toEqual([
        "pendiente",
        "pendiente",
        "pendiente",
      ])
    })

    it("si un paso se registró dos veces (prótesis de antes de la etapa 7c), cuenta el primero", () => {
      const etapas = etapasDeLaProtesis("corona", "prueba", [
        evento("impresion", "d1", "Ana"),
        evento("impresion", "d2", "Beto"),
        evento("prueba", "d3"),
        evento("prueba", "d4"),
      ])
      expect(etapas[0]).toMatchObject({ situacion: "hecha", fecha: "d1", autorNombre: "Ana" })
      expect(etapas[1]).toMatchObject({ situacion: "actual", fecha: "d3" })
    })
  })
})

describe("el tono (guía VITA classical)", () => {
  it("los 19 tonos en el orden de la guía, con su etiqueta, su grupo y un color de referencia", () => {
    expect(TONOS_VITA.map((tono) => tono.etiqueta)).toEqual([
      "0M1", "0M2", "0M3", "A1", "A2", "A3", "A3,5", "A4", "B1", "B2", "B3", "B4", "C1", "C2", "C3", "C4", "D2", "D3", "D4",
    ])
    expect(new Set(TONOS_VITA.map((tono) => tono.id)).size).toBe(19)
    for (const tono of TONOS_VITA) {
      expect(tono.id).toMatch(/^[0-9A-Z.]+$/)
      expect(tono.color).toMatch(/^#[0-9A-F]{6}$/)
      expect(tono.etiqueta.startsWith(tono.grupo)).toBe(true)
    }
    expect(GRUPOS_DE_TONOS.map((grupo) => [grupo.id, grupo.nombre])).toEqual([
      ["0M", "Blanqueamiento"],
      ["A", "Rojizo-marrón"],
      ["B", "Rojizo-amarillo"],
      ["C", "Gris"],
      ["D", "Rojizo-gris"],
    ])
  })

  it("se guarda el id seguro y se muestra con coma", () => {
    expect(esTonoVita("A3.5")).toBe(true)
    expect(esTonoVita("A3,5")).toBe(false)
    expect(esTonoVita("D1")).toBe(false)
    expect(etiquetaDeTono("A3.5")).toBe("A3,5")
    expect(etiquetaDeTono("B2")).toBe("B2")
    expect(tonoDeLaGuia("0M2")).toMatchObject({ grupo: "0M" })
    expect(tonoDeLaGuia(null)).toBeNull()
    expect(tonoDeLaGuia("constructor")).toBeNull()
  })
})

describe("el nombre para el plan", () => {
  it("tipo · material (piezas y pilares en orden)", () => {
    expect(nombreParaElPlan({ tipo: "removible", materialNombre: "Acrílico termocurado", arcada: "inferior", piezas: [46], pilares: [47, 45] })).toBe(
      "Removible parcial · Acrílico termocurado (45, 46, 47)"
    )
    expect(nombreParaElPlan({ tipo: "corona", materialNombre: "Zirconio", arcada: "superior", piezas: [21], pilares: [] })).toBe(
      "Corona unitaria · Zirconio (21)"
    )
  })

  it("la total dice la arcada", () => {
    const total = { tipo: "total", materialNombre: "Acrílico termocurado", pilares: [] }
    expect(nombreParaElPlan({ ...total, arcada: "superior", piezas: piezasDeLaArcada("superior") })).toBe(
      "Total · Acrílico termocurado (arcada superior)"
    )
    expect(nombreParaElPlan({ ...total, arcada: "ambas", piezas: piezasDeLaArcada("ambas") })).toBe("Total · Acrílico termocurado (ambas arcadas)")
  })

  it("si no cabe en 120 caracteres, cuenta las piezas", () => {
    const nombre = nombreParaElPlan({
      tipo: "removible",
      materialNombre: "Un material con un nombre muy largo de verdad, más de sesenta caracteres",
      arcada: "ambas",
      piezas: [11, 12, 13, 14, 15, 16, 21, 22, 23, 24, 31, 32, 33],
      pilares: [17, 27, 37, 47],
    })
    expect(nombre).toMatch(/\(17 piezas\)$/)
    expect(nombre.length).toBeLessThanOrEqual(120)
  })
})

describe("materiales iniciales", () => {
  it("los cinco del diseño, con su precio y su reparto, y válidos", () => {
    expect(MATERIALES_INICIALES.map((m) => [m.nombre, m.unidad, m.precioCents, m.pbOdontologo, m.pbClinica, m.pbTecnico])).toEqual([
      ["Acrílico termocurado", "arcada", 18_000_000, 4000, 3000, 3000],
      ["Flexible (nylon)", "arcada", 32_000_000, 3500, 2500, 4000],
      ["Cromo-cobalto", "arcada", 45_000_000, 3500, 2500, 4000],
      ["Metal-porcelana", "pieza", 22_000_000, 4000, 2000, 4000],
      ["Zirconio", "pieza", 29_000_000, 3500, 2000, 4500],
    ])
    for (const material of MATERIALES_INICIALES) {
      expect(esRepartoValido(material)).toBe(true)
      expect(errorDeTiposDelMaterial(material.unidad, material.tipos)).toBeNull()
    }
  })

  it("sólo una clínica dental los recibe, y como copias", () => {
    expect(materialesDeProtesisDeEjemplo("odontologia")).toHaveLength(5)
    expect(materialesDeProtesisDeEjemplo("salon")).toEqual([])
    expect(materialesDeProtesisDeEjemplo("")).toEqual([])
    const copia = materialesDeProtesisDeEjemplo("odontologia")
    copia[0].tipos.push("fija")
    expect(MATERIALES_INICIALES[0].tipos).toEqual(["removible", "total"])
  })
})
