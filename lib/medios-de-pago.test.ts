import { describe, it, expect } from "vitest"
import { IDS_DE_MEDIOS_DE_PAGO, MEDIOS_DE_PAGO, esMedioDePago, nombreDeMedio } from "./medios-de-pago"

describe("MEDIOS_DE_PAGO", () => {
  it("son los cinco medios fijos del producto, con estos ids", () => {
    expect(MEDIOS_DE_PAGO.map((medio) => medio.id)).toEqual([
      "efectivo",
      "tarjeta-debito",
      "tarjeta-credito",
      "transferencia",
      "billetera-digital",
    ])
  })

  it("no repite ids y todos tienen nombre para mostrar", () => {
    expect(new Set(IDS_DE_MEDIOS_DE_PAGO).size).toBe(MEDIOS_DE_PAGO.length)
    for (const medio of MEDIOS_DE_PAGO) {
      expect(medio.nombre.length).toBeGreaterThan(0)
    }
  })

  it("IDS_DE_MEDIOS_DE_PAGO sale del catálogo, en el mismo orden", () => {
    expect([...IDS_DE_MEDIOS_DE_PAGO]).toEqual(MEDIOS_DE_PAGO.map((medio) => medio.id))
  })
})

describe("nombreDeMedio", () => {
  it.each([
    ["efectivo", "Efectivo"],
    ["tarjeta-debito", "Tarjeta de débito"],
    ["tarjeta-credito", "Tarjeta de crédito"],
    ["transferencia", "Transferencia"],
    ["billetera-digital", "Billetera digital"],
  ])("el id %s se muestra como %s", (id, nombre) => {
    expect(nombreDeMedio(id)).toBe(nombre)
  })

  it("un id desconocido o vacío cae a un texto neutro sin romper: un pago es historial", () => {
    expect(nombreDeMedio("cheque")).toBe("Otro medio")
    expect(nombreDeMedio("")).toBe("Otro medio")
  })

  it("un id que coincide con una propiedad del prototipo no se confunde con un medio", () => {
    expect(nombreDeMedio("constructor")).toBe("Otro medio")
    expect(nombreDeMedio("__proto__")).toBe("Otro medio")
  })
})

describe("esMedioDePago", () => {
  it("acepta los del catálogo y nada más", () => {
    expect(esMedioDePago("efectivo")).toBe(true)
    expect(esMedioDePago("Efectivo")).toBe(false)
    expect(esMedioDePago("cheque")).toBe(false)
    expect(esMedioDePago("toString")).toBe(false)
  })
})
