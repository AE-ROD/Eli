import { describe, expect, it } from "vitest"
import { comisionEnCentavos } from "@/lib/comisiones"
import {
  MATERIALES_INICIALES,
  MENSAJE_PROTESIS_CERRADA,
  MENSAJE_SIN_LABORATORIO,
  MENSAJE_SOLO_AVANZA,
  PASOS_DEL_SEGUIMIENTO,
  errorDeCambioDeEstado,
  errorDeTiposDelMaterial,
  errorDelDiseno,
  esMaterialCompatible,
  esPiezaDeLaArcada,
  esRepartoValido,
  estaCerrada,
  llevaBase,
  materialesDeProtesisDeEjemplo,
  nombreDeEstado,
  nombreDeTipo,
  nombreParaElPlan,
  normalizarDiseno,
  ordenarTipos,
  pasoSiguiente,
  piezasDeLaArcada,
  repartirMonto,
  repartoEfectivo,
  repartoQueAplica,
  textoDePorcentaje,
  textoDeUnidades,
  tiposDeLaUnidad,
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
    expect(nombreDeEstado("prueba")).toBe("Prueba en boca")
    expect(nombreDeEstado("anulada")).toBe("Anulada")
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

  it("acepta una removible inferior con pieza, pilares y barra lingual", () => {
    expect(errorDelDiseno(removible())).toBeNull()
  })

  it.each([
    ["una pieza de la otra arcada", removible({ piezas: [16] }), /no es de la arcada inferior/],
    ["una pieza temporal", removible({ piezas: [84] }), /dentición permanente/],
    ["una pieza que no existe", removible({ piezas: [49] }), /dentición permanente/],
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
    ["una total con pilares", { tipo: "total", arcada: "superior", piezas: piezasDeLaArcada("superior").slice(1), pilares: [11], zonas: [] }, /no lleva pilares/],
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

  it("normalizar: la total marca todas las piezas de la arcada y sin pilares, aunque manden otras", () => {
    const total = normalizarDiseno({ tipo: "total", arcada: "superior", piezas: [11], pilares: [12], zonas: ["paladar"] })
    expect(total.piezas).toEqual(piezasDeLaArcada("superior"))
    expect(total.pilares).toEqual([])
    expect(errorDelDiseno(total)).toBeNull()
    expect(normalizarDiseno({ tipo: "total", arcada: "ambas", piezas: [], pilares: [], zonas: [] }).piezas).toHaveLength(32)
  })

  it("normalizar: ordena piezas y pilares y deja las zonas en el orden del catálogo, sin perder las desconocidas", () => {
    const normal = normalizarDiseno(removible({ piezas: [47, 46], pilares: [48, 45], zonas: ["rebasado", "lingual", "encia"] }))
    expect(normal.piezas).toEqual([46, 47])
    expect(normal.pilares).toEqual([45, 48])
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
  it("el paso siguiente, en orden, hasta entregada", () => {
    expect(PASOS_DEL_SEGUIMIENTO.map((paso) => pasoSiguiente(paso.id))).toEqual(["en-laboratorio", "prueba", "ajustes", "entregada", null])
    expect(pasoSiguiente("anulada")).toBeNull()
  })

  it("sólo hacia adelante, se puede saltar un paso, y anular antes de entregar", () => {
    expect(errorDeCambioDeEstado("impresion", "en-laboratorio", true)).toBeNull()
    expect(errorDeCambioDeEstado("prueba", "entregada", true)).toBeNull()
    expect(errorDeCambioDeEstado("ajustes", "prueba", true)).toBe(MENSAJE_SOLO_AVANZA)
    expect(errorDeCambioDeEstado("prueba", "prueba", true)).toBe(MENSAJE_SOLO_AVANZA)
    expect(errorDeCambioDeEstado("en-laboratorio", "impresion", true)).toBe(MENSAJE_SOLO_AVANZA)
    expect(errorDeCambioDeEstado("impresion", "anulada", false)).toBeNull()
    expect(errorDeCambioDeEstado("ajustes", "anulada", true)).toBeNull()
  })

  it("entregada y anulada no cambian más", () => {
    expect(estaCerrada("entregada")).toBe(true)
    expect(estaCerrada("anulada")).toBe(true)
    expect(estaCerrada("prueba")).toBe(false)
    expect(errorDeCambioDeEstado("entregada", "anulada", true)).toBe(MENSAJE_PROTESIS_CERRADA)
    expect(errorDeCambioDeEstado("anulada", "entregada", true)).toBe(MENSAJE_PROTESIS_CERRADA)
  })

  it("enviar al laboratorio (o más allá) pide un laboratorio", () => {
    expect(errorDeCambioDeEstado("impresion", "en-laboratorio", false)).toBe(MENSAJE_SIN_LABORATORIO)
    expect(errorDeCambioDeEstado("impresion", "entregada", false)).toBe(MENSAJE_SIN_LABORATORIO)
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
