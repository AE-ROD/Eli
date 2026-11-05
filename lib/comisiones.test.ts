import { describe, expect, it } from "vitest"
import {
  comisionEnCentavos,
  comisionParaCongelar,
  esPorcentajeDeComision,
  estadoDeComision,
  porcentajeDeLinea,
  puntosBase,
  type LineaParaComision,
  type PorcentajesVigentes,
} from "./comisiones"

describe("comisionEnCentavos", () => {
  it("los criterios de #65: 40 % y 33,33 % de $14.990", () => {
    expect(comisionEnCentavos(1_499_000, 40)).toBe(599_600)
    expect(comisionEnCentavos(1_499_000, 33.33)).toBe(499_617)
  })

  it("0 % es 0 y 100 % es el precio", () => {
    expect(comisionEnCentavos(1_499_000, 0)).toBe(0)
    expect(comisionEnCentavos(1_499_000, 100)).toBe(1_499_000)
    expect(comisionEnCentavos(0, 50)).toBe(0)
  })

  it("12,5 % de precios impares redondea al centavo, medio centavo hacia arriba", () => {
    expect(comisionEnCentavos(1, 12.5)).toBe(0) // 0,125
    expect(comisionEnCentavos(3, 12.5)).toBe(0) // 0,375
    expect(comisionEnCentavos(4, 12.5)).toBe(1) // 0,5 exacto → arriba
    expect(comisionEnCentavos(5, 12.5)).toBe(1) // 0,625
    expect(comisionEnCentavos(999, 12.5)).toBe(125) // 124,875
    expect(comisionEnCentavos(12_345, 12.5)).toBe(1_543) // 1543,125
  })

  it("medio centavo exacto sube; apenas menos, baja", () => {
    expect(comisionEnCentavos(1, 50)).toBe(1) // 0,5
    expect(comisionEnCentavos(1, 49.99)).toBe(0) // 0,4999
    expect(comisionEnCentavos(3, 50)).toBe(2) // 1,5
  })

  it("en el tope de 2e9 sigue siendo exacto (el producto queda bajo 2^53)", () => {
    expect(2_000_000_000 * 10_000).toBeLessThan(Number.MAX_SAFE_INTEGER)
    expect(comisionEnCentavos(2_000_000_000, 100)).toBe(2_000_000_000)
    expect(comisionEnCentavos(2_000_000_000, 33.33)).toBe(666_600_000)
    expect(comisionEnCentavos(1_999_999_999, 0.01)).toBe(200_000) // 199.999,9999
  })

  it("nunca supera el precio", () => {
    for (const precio of [1, 7, 99, 1_499_000, 2_000_000_000]) {
      for (const porcentaje of [0.01, 12.5, 33.33, 99.99, 100]) {
        expect(comisionEnCentavos(precio, porcentaje)).toBeLessThanOrEqual(precio)
      }
    }
  })

  it.each([
    ["precio negativo", -1, 10],
    ["precio con decimales", 10.5, 10],
    ["precio sobre el tope", 2_000_000_001, 10],
    ["% negativo", 100, -1],
    ["% sobre 100", 100, 100.01],
    ["% con 3 decimales", 100, 12.345],
    ["% NaN", 100, Number.NaN],
  ])("lanza con %s", (_caso, precio, porcentaje) => {
    expect(() => comisionEnCentavos(precio, porcentaje)).toThrow(RangeError)
  })
})

describe("esPorcentajeDeComision y puntosBase", () => {
  it("acepta 0 a 100 con hasta dos decimales", () => {
    for (const valor of [0, 0.01, 12.5, 33.33, 99.99, 100]) expect(esPorcentajeDeComision(valor)).toBe(true)
    expect(puntosBase(33.33)).toBe(3333)
    expect(puntosBase(12.5)).toBe(1250)
    expect(puntosBase(0.29)).toBe(29) // 0,29 * 100 = 28,999… en flotante
  })

  it("rechaza null, textos, infinitos, fuera de rango y más de dos decimales", () => {
    for (const valor of [null, undefined, "40", Number.POSITIVE_INFINITY, -0.01, 100.01, 0.001, 12.345]) {
      expect(esPorcentajeDeComision(valor)).toBe(false)
    }
  })
})

describe("porcentajeDeLinea: la cascada", () => {
  const vigentes: PorcentajesVigentes = {
    porMiembro: new Map<string, number | null>([
      ["m-carla", 40],
      ["m-pedro", null],
      ["m-cero", 0],
    ]),
    excepciones: new Map([["m-carla", new Map([["s-color", 50]])], ["m-pedro", new Map([["s-color", 30]])]]),
    porProducto: new Map<string, number | null>([
      ["p-shampoo", 10],
      ["p-sin", null],
    ]),
  }
  const servicio = (datos: Partial<LineaParaComision> = {}): LineaParaComision => ({
    tipo: "servicio",
    byOwner: false,
    memberId: "m-carla",
    serviceId: "s-corte",
    productId: null,
    ...datos,
  })
  const producto = (productId: string | null, datos: Partial<LineaParaComision> = {}): LineaParaComision =>
    servicio({ tipo: "producto", serviceId: null, productId, ...datos })

  it("la excepción del servicio gana sobre el % del miembro", () => {
    expect(porcentajeDeLinea(servicio({ serviceId: "s-color" }), vigentes)).toEqual({
      tipo: "porcentaje",
      porcentaje: 50,
      origen: "excepcion",
    })
  })

  it("sin excepción, el % por defecto del miembro", () => {
    expect(porcentajeDeLinea(servicio(), vigentes)).toEqual({ tipo: "porcentaje", porcentaje: 40, origen: "miembro" })
    expect(porcentajeDeLinea(servicio({ serviceId: null }), vigentes)).toEqual({
      tipo: "porcentaje",
      porcentaje: 40,
      origen: "miembro",
    })
  })

  it("una excepción sirve aunque el miembro no tenga % por defecto", () => {
    expect(porcentajeDeLinea(servicio({ memberId: "m-pedro", serviceId: "s-color" }), vigentes)).toEqual({
      tipo: "porcentaje",
      porcentaje: 30,
      origen: "excepcion",
    })
  })

  it("sin nada configurado es pendiente, nunca 0", () => {
    expect(porcentajeDeLinea(servicio({ memberId: "m-pedro" }), vigentes)).toEqual({ tipo: "pendiente" })
    expect(porcentajeDeLinea(servicio({ memberId: "m-desconocido" }), vigentes)).toEqual({ tipo: "pendiente" })
  })

  it("0 % configurado es 0, no pendiente", () => {
    expect(porcentajeDeLinea(servicio({ memberId: "m-cero" }), vigentes)).toEqual({
      tipo: "porcentaje",
      porcentaje: 0,
      origen: "miembro",
    })
  })

  it("un producto usa su %, no el del miembro; sin % o borrado, pendiente", () => {
    expect(porcentajeDeLinea(producto("p-shampoo"), vigentes)).toEqual({ tipo: "porcentaje", porcentaje: 10, origen: "producto" })
    expect(porcentajeDeLinea(producto("p-sin"), vigentes)).toEqual({ tipo: "pendiente" })
    expect(porcentajeDeLinea(producto(null), vigentes)).toEqual({ tipo: "pendiente" })
  })

  it("la línea de la dueña y la de alguien que ya no está no llevan comisión", () => {
    expect(porcentajeDeLinea(servicio({ byOwner: true, memberId: null }), vigentes)).toEqual({ tipo: "no-aplica" })
    expect(porcentajeDeLinea(producto("p-shampoo", { byOwner: true, memberId: null }), vigentes)).toEqual({ tipo: "no-aplica" })
    expect(porcentajeDeLinea(servicio({ memberId: null }), vigentes)).toEqual({ tipo: "no-aplica" })
  })
})

describe("comisionParaCongelar", () => {
  const vigentes: PorcentajesVigentes = {
    porMiembro: new Map([["m-carla", 40]]),
    excepciones: new Map(),
    porProducto: new Map(),
  }
  const ahora = new Date("2026-10-28T15:00:00Z")
  const linea = { tipo: "servicio" as const, byOwner: false, memberId: "m-carla", serviceId: "s-corte", productId: null, priceCents: 1_499_000 }

  it("con %: los tres valores juntos", () => {
    expect(comisionParaCongelar(linea, vigentes, ahora)).toEqual({
      commissionPercent: 40,
      commissionCents: 599_600,
      commissionAt: ahora,
    })
  })

  it("pendiente y no aplica: los tres en null", () => {
    const nulos = { commissionPercent: null, commissionCents: null, commissionAt: null }
    expect(comisionParaCongelar({ ...linea, memberId: "m-pedro" }, vigentes, ahora)).toEqual(nulos)
    expect(comisionParaCongelar({ ...linea, memberId: null, byOwner: true }, vigentes, ahora)).toEqual(nulos)
  })
})

describe("estadoDeComision", () => {
  it("congelada si tiene commissionAt; si no, pendiente o no aplica", () => {
    expect(estadoDeComision({ byOwner: false, memberId: "m", commissionAt: new Date() })).toBe("congelada")
    expect(estadoDeComision({ byOwner: false, memberId: "m", commissionAt: null })).toBe("pendiente")
    expect(estadoDeComision({ byOwner: true, memberId: null, commissionAt: null })).toBe("no-aplica")
    expect(estadoDeComision({ byOwner: false, memberId: null, commissionAt: null })).toBe("no-aplica")
  })
})
