import { describe, expect, it } from "vitest"
import {
  IDS_DE_ZONAS_DE_CHILE,
  ZONAS_DE_CHILE,
  esZonaDeChile,
  esZonaGuardable,
  horaActualEn,
  zonaDeChilePorId,
  zonaVigente,
} from "./zonas-de-chile"
import { esZonaValida } from "./zona-horaria"

describe("ZONAS_DE_CHILE", () => {
  it("son las tres de Chile, con su nombre en español, en este orden", () => {
    expect(ZONAS_DE_CHILE.map((zona) => [zona.id, zona.nombre])).toEqual([
      ["America/Santiago", "Chile continental"],
      ["America/Punta_Arenas", "Magallanes"],
      ["Pacific/Easter", "Isla de Pascua"],
    ])
    expect(IDS_DE_ZONAS_DE_CHILE).toEqual(["America/Santiago", "America/Punta_Arenas", "Pacific/Easter"])
  })

  it("el motor conoce las tres (si no, no se podrían calcular las horas del negocio)", () => {
    for (const zona of ZONAS_DE_CHILE) expect(esZonaValida(zona.id)).toBe(true)
  })

  it("cada una dice quiénes están en ella", () => {
    for (const zona of ZONAS_DE_CHILE) expect(zona.detalle.length).toBeGreaterThan(0)
  })
})

describe("esZonaDeChile / esZonaGuardable", () => {
  it("acepta las tres exactas", () => {
    for (const id of IDS_DE_ZONAS_DE_CHILE) {
      expect(esZonaDeChile(id)).toBe(true)
      expect(esZonaGuardable(id)).toBe(true)
    }
  })

  it.each([
    "America/Lima",
    "UTC",
    "america/santiago",
    "America/Santiago ",
    "-03:00",
    "",
    "America/Punta Arenas",
    null,
    undefined,
    7,
    ["America/Santiago"],
  ])("rechaza %j: no está en la lista", (valor) => {
    expect(esZonaDeChile(valor)).toBe(false)
    expect(esZonaGuardable(valor)).toBe(false)
  })
})

describe("zonaVigente", () => {
  it("una zona de la lista es propia", () => {
    expect(zonaVigente("America/Punta_Arenas")).toEqual({ id: "America/Punta_Arenas", propia: true })
    expect(zonaVigente("Pacific/Easter")).toEqual({ id: "Pacific/Easter", propia: true })
  })

  it("sin zona o con una que el motor no conoce, la de Santiago (la que usa el resto de la aplicación)", () => {
    expect(zonaVigente(null)).toEqual({ id: "America/Santiago", propia: true })
    expect(zonaVigente(undefined)).toEqual({ id: "America/Santiago", propia: true })
    expect(zonaVigente("No/Existe")).toEqual({ id: "America/Santiago", propia: true })
  })

  it("una zona válida de otro país se muestra tal cual y no es propia: la pantalla lo avisa", () => {
    expect(zonaVigente("America/Lima")).toEqual({ id: "America/Lima", propia: false })
  })
})

describe("zonaDeChilePorId", () => {
  it("encuentra la de la lista y devuelve null para cualquier otra", () => {
    expect(zonaDeChilePorId("Pacific/Easter")?.nombre).toBe("Isla de Pascua")
    expect(zonaDeChilePorId("America/Lima")).toBeNull()
  })
})

describe("horaActualEn", () => {
  // 12 de noviembre: verano en Chile (Santiago -3, Isla de Pascua -5, Magallanes -3 todo el año).
  const enVerano = new Date("2026-11-12T15:00:00Z")
  // 12 de junio: invierno (Santiago -4, Isla de Pascua -6).
  const enInvierno = new Date("2026-06-12T15:00:00Z")

  it("la hora de pared de cada zona en verano", () => {
    expect(horaActualEn(enVerano, "America/Santiago")).toBe("12:00")
    expect(horaActualEn(enVerano, "America/Punta_Arenas")).toBe("12:00")
    expect(horaActualEn(enVerano, "Pacific/Easter")).toBe("10:00")
  })

  it("y en invierno: Santiago atrasa una hora y Magallanes no", () => {
    expect(horaActualEn(enInvierno, "America/Santiago")).toBe("11:00")
    expect(horaActualEn(enInvierno, "America/Punta_Arenas")).toBe("12:00")
    expect(horaActualEn(enInvierno, "Pacific/Easter")).toBe("09:00")
  })

  it("lleva los minutos y los ceros a la izquierda", () => {
    expect(horaActualEn(new Date("2026-11-12T03:05:00Z"), "America/Santiago")).toBe("00:05")
    expect(horaActualEn(new Date("2026-11-12T12:47:30Z"), "America/Santiago")).toBe("09:47")
  })

  it("una zona que el motor no conoce se lee en Santiago, sin lanzar", () => {
    expect(horaActualEn(enVerano, "No/Existe")).toBe("12:00")
    expect(horaActualEn(enVerano, "")).toBe("12:00")
  })
})
