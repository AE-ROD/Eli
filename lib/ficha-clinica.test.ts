import { describe, expect, it } from "vitest"
import {
  MAXIMO_DE_MARCAS,
  antecedentesSchema,
  cambiosDelOdontograma,
  edadEn,
  errorDelOdontograma,
  evolucionSchema,
  nombreDePrevision,
  odontogramaSchema,
  ordenarMarcas,
} from "./ficha-clinica"

describe("nombreDePrevision", () => {
  it("nombra las de la lista y no rompe con una que no conoce", () => {
    expect(nombreDePrevision("isapre")).toBe("Isapre")
    expect(nombreDePrevision("constructor")).toBe("Previsión desconocida")
  })
})

describe("edadEn", () => {
  it("cuenta los años cumplidos: el día del cumpleaños ya los cumplió, el día antes no", () => {
    expect(edadEn("1992-03-15", "2026-03-15")).toBe(34)
    expect(edadEn("1992-03-15", "2026-03-14")).toBe(33)
    expect(edadEn("1992-03-15", "2026-11-06")).toBe(34)
  })

  it("quien nació un 29 de febrero cumple el 1 de marzo en un año no bisiesto", () => {
    expect(edadEn("2000-02-29", "2026-02-28")).toBe(25)
    expect(edadEn("2000-02-29", "2026-03-01")).toBe(26)
    expect(edadEn("2000-02-29", "2028-02-29")).toBe(28)
  })

  it("un recién nacido tiene 0; una fecha futura o inválida no tiene edad", () => {
    expect(edadEn("2026-11-06", "2026-11-06")).toBe(0)
    expect(edadEn("2026-11-07", "2026-11-06")).toBeNull()
    expect(edadEn("2026-02-30", "2026-11-06")).toBeNull()
    expect(edadEn("ayer", "2026-11-06")).toBeNull()
  })
})

describe("antecedentesSchema", () => {
  const esquema = antecedentesSchema("2026-11-06")

  it("recorta los textos, y vacío o sólo espacios se guarda como null", () => {
    expect(esquema.parse({ alergias: "  Penicilina ", antecedentes: "   ", prevision: "", fechaNacimiento: "" })).toEqual({
      alergias: "Penicilina",
      antecedentes: null,
      prevision: null,
      fechaNacimiento: null,
    })
  })

  it("lo que no viene no aparece: no se toca", () => {
    expect(esquema.parse({ prevision: "isapre" })).toEqual({ prevision: "isapre" })
  })

  it.each([
    ["una fecha futura", { fechaNacimiento: "2026-11-07" }, "La fecha de nacimiento no puede ser futura"],
    ["una fecha antes de 1900", { fechaNacimiento: "1899-12-31" }, "La fecha de nacimiento no puede ser anterior a 1900"],
    ["un día que no existe", { fechaNacimiento: "2026-02-30" }, "La fecha de nacimiento no es válida"],
    ["otro formato", { fechaNacimiento: "15/03/1992" }, "La fecha de nacimiento no es válida"],
    ["un número", { fechaNacimiento: 19920315 }, "La fecha de nacimiento no es válida"],
    ["una previsión fuera de la lista", { prevision: "capredena" }, "La previsión tiene que ser Fonasa, Isapre, Particular u Otra"],
    ["alergias de más de 500", { alergias: "x".repeat(501) }, "Las alergias no pueden tener más de 500 caracteres"],
    ["antecedentes de más de 4000", { antecedentes: "x".repeat(4001) }, "Los antecedentes no pueden tener más de 4000 caracteres"],
  ])("rechaza %s", (_caso, cuerpo, mensaje) => {
    const resultado = esquema.safeParse(cuerpo)
    expect(resultado.success).toBe(false)
    expect(resultado.error?.issues[0].message).toBe(mensaje)
  })
})

describe("errorDelOdontograma", () => {
  it("acepta marcas válidas de cara y de pieza", () => {
    expect(
      errorDelOdontograma([
        { pieza: 16, cara: "O", tipo: "caries" },
        { pieza: 16, cara: "M", tipo: "caries" },
        { pieza: 16, cara: null, tipo: "endodoncia" },
        { pieza: 16, cara: null, tipo: "corona" },
        { pieza: 55, cara: "P", tipo: "sellante" },
      ])
    ).toBeNull()
  })

  it("usa las reglas de errorDeMarca: pieza, tipo y cara de la pieza", () => {
    expect(errorDelOdontograma([{ pieza: 19, cara: "O", tipo: "caries" }])).toBe("Esa pieza no existe en el odontograma.")
    expect(errorDelOdontograma([{ pieza: 36, cara: "P", tipo: "caries" }])).toBe("La pieza 36 no tiene cara palatina.")
    expect(errorDelOdontograma([{ pieza: 11, cara: "O", tipo: "caries" }])).toBe("La pieza 11 no tiene cara oclusal.")
    expect(errorDelOdontograma([{ pieza: 21, cara: "V", tipo: "corona" }])).toBe("Corona es de la pieza entera, sin cara.")
    expect(errorDelOdontograma([{ pieza: 21, cara: null, tipo: "caries" }])).toBe("Caries va en una cara de la pieza.")
    expect(errorDelOdontograma([{ pieza: 21, cara: null, tipo: "implante" }])).toBe("Esa marca no existe en el odontograma.")
  })

  it("una cara lleva una sola marca, y una marca de pieza no se repite en la pieza", () => {
    expect(
      errorDelOdontograma([
        { pieza: 16, cara: "O", tipo: "caries" },
        { pieza: 16, cara: "O", tipo: "obturacion" },
      ])
    ).toBe("La cara oclusal de la pieza 16 tiene dos marcas: una cara lleva una sola.")
    expect(
      errorDelOdontograma([
        { pieza: 21, cara: null, tipo: "corona" },
        { pieza: 21, cara: null, tipo: "corona" },
      ])
    ).toBe("La pieza 21 tiene dos veces Corona.")
    // La misma cara en otra pieza, o la misma marca de pieza en otra, no chocan.
    expect(
      errorDelOdontograma([
        { pieza: 16, cara: "O", tipo: "caries" },
        { pieza: 26, cara: "O", tipo: "caries" },
        { pieza: 21, cara: null, tipo: "corona" },
        { pieza: 11, cara: null, tipo: "corona" },
      ])
    ).toBeNull()
  })
})

describe("odontogramaSchema", () => {
  it("una marca de pieza puede venir sin cara: queda en null", () => {
    expect(odontogramaSchema.parse({ marcas: [{ pieza: 46, tipo: "ausente" }] })).toEqual({
      marcas: [{ pieza: 46, cara: null, tipo: "ausente" }],
    })
  })

  it("el conjunto vacío vale: borra el odontograma", () => {
    expect(odontogramaSchema.parse({ marcas: [] })).toEqual({ marcas: [] })
  })

  it("rechaza más marcas que las que caben en una boca", () => {
    const demasiadas = Array.from({ length: MAXIMO_DE_MARCAS + 1 }, () => ({ pieza: 11, cara: "V", tipo: "caries" }))
    const resultado = odontogramaSchema.safeParse({ marcas: demasiadas })
    expect(resultado.success).toBe(false)
    expect(resultado.error?.issues[0].message).toBe(`Un odontograma no puede tener más de ${MAXIMO_DE_MARCAS} marcas`)
  })

  it("MAXIMO_DE_MARCAS es toda pieza con sus cinco caras y cada marca de pieza", () => {
    expect(MAXIMO_DE_MARCAS).toBe((32 + 20) * (5 + 4))
  })

  it("sin marcas, o con marcas que no son una lista, es un 400", () => {
    expect(odontogramaSchema.safeParse({}).success).toBe(false)
    expect(odontogramaSchema.safeParse({ marcas: "16O" }).success).toBe(false)
    expect(odontogramaSchema.safeParse(undefined).success).toBe(false)
  })
})

describe("cambiosDelOdontograma", () => {
  const actuales = [
    { id: "a", pieza: 16, cara: "O", tipo: "caries" },
    { id: "b", pieza: 16, cara: "M", tipo: "caries" },
    { id: "c", pieza: 21, cara: null, tipo: "corona" },
  ]

  it("lo que sigue igual no se toca; lo que no viene se borra; lo nuevo se crea", () => {
    expect(
      cambiosDelOdontograma(actuales, [
        { pieza: 16, cara: "O", tipo: "caries" },
        { pieza: 21, cara: null, tipo: "corona" },
        { pieza: 46, cara: null, tipo: "ausente" },
      ])
    ).toEqual({ borrar: ["b"], crear: [{ pieza: 46, cara: null, tipo: "ausente" }] })
  })

  it("si en una cara cambia el tipo, la marca vieja se borra y se crea la nueva", () => {
    expect(
      cambiosDelOdontograma(actuales, [
        { pieza: 16, cara: "O", tipo: "obturacion" },
        { pieza: 16, cara: "M", tipo: "caries" },
        { pieza: 21, cara: null, tipo: "corona" },
      ])
    ).toEqual({ borrar: ["a"], crear: [{ pieza: 16, cara: "O", tipo: "obturacion" }] })
  })

  it("el mismo conjunto no cambia nada", () => {
    expect(cambiosDelOdontograma(actuales, actuales)).toEqual({ borrar: [], crear: [] })
  })
})

describe("ordenarMarcas", () => {
  it("por pieza; dentro de la pieza, las de cara en el orden de la pieza y al final las de pieza", () => {
    expect(
      ordenarMarcas([
        { pieza: 21, cara: null, tipo: "corona" },
        { pieza: 16, cara: null, tipo: "endodoncia" },
        { pieza: 16, cara: "M", tipo: "caries" },
        { pieza: 16, cara: "O", tipo: "caries" },
        { pieza: 11, cara: "V", tipo: "sellante" },
      ])
    ).toEqual([
      { pieza: 11, cara: "V", tipo: "sellante" },
      { pieza: 16, cara: "O", tipo: "caries" },
      { pieza: 16, cara: "M", tipo: "caries" },
      { pieza: 16, cara: null, tipo: "endodoncia" },
      { pieza: 21, cara: null, tipo: "corona" },
    ])
  })
})

describe("evolucionSchema", () => {
  it("recorta el texto y exige que haya algo", () => {
    expect(evolucionSchema.parse({ texto: "  Control sin novedad. " })).toEqual({ texto: "Control sin novedad." })
    expect(evolucionSchema.safeParse({ texto: "   " }).error?.issues[0].message).toBe("Escribe la evolución")
    expect(evolucionSchema.safeParse({}).error?.issues[0].message).toBe("Escribe la evolución")
  })

  it("tiene tope", () => {
    expect(evolucionSchema.safeParse({ texto: "x".repeat(4001) }).error?.issues[0].message).toBe(
      "La evolución no puede tener más de 4000 caracteres"
    )
  })
})
