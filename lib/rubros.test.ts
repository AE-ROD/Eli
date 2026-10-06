import { describe, it, expect } from "vitest"
import { IDS_DE_RUBROS, RUBROS, nombreDeRubro } from "./rubros"

describe("RUBROS", () => {
  it("son los tres que Eli atiende, con el id de siempre para el salón", () => {
    expect(RUBROS.map((rubro) => rubro.id)).toEqual(["salon", "barberia", "spa-de-unas"])
  })

  it("`salon` se conserva: ya está guardado en negocios reales", () => {
    expect(IDS_DE_RUBROS).toContain("salon")
  })

  it("no repite ids, y todos tienen nombre e ícono para mostrar", () => {
    expect(new Set(IDS_DE_RUBROS).size).toBe(RUBROS.length)
    for (const rubro of RUBROS) {
      expect(rubro.nombre.length).toBeGreaterThan(0)
      expect(rubro.icono.length).toBeGreaterThan(0)
    }
  })

  it("IDS_DE_RUBROS sale del catálogo, en el mismo orden", () => {
    expect([...IDS_DE_RUBROS]).toEqual(RUBROS.map((rubro) => rubro.id))
  })
})

describe("nombreDeRubro", () => {
  it.each([
    ["salon", "Salón de belleza"],
    ["barberia", "Barbería"],
    ["spa-de-unas", "Spa de uñas"],
  ])("el id %s se muestra como %s", (id, nombre) => {
    expect(nombreDeRubro(id)).toBe(nombre)
  })

  it.each(["salud", "fitness", "otro"])(
    "el id viejo %s, que sigue en la base, cae a un texto neutro sin romper",
    (id) => {
      expect(nombreDeRubro(id)).toBe("Otro rubro")
    }
  )

  it("un id desconocido o vacío tampoco rompe", () => {
    expect(nombreDeRubro("")).toBe("Otro rubro")
    expect(nombreDeRubro("peluqueria-canina")).toBe("Otro rubro")
  })

  it("un id que coincide con una propiedad del prototipo no se confunde con un rubro", () => {
    expect(nombreDeRubro("constructor")).toBe("Otro rubro")
    expect(nombreDeRubro("__proto__")).toBe("Otro rubro")
    expect(nombreDeRubro("toString")).toBe("Otro rubro")
  })
})
