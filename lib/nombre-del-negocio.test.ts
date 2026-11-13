import { describe, expect, it } from "vitest"
import {
  LARGO_MAXIMO_DEL_NOMBRE_DEL_NEGOCIO,
  LARGO_MINIMO_DEL_NOMBRE_DEL_NEGOCIO,
  MENSAJES_DEL_NOMBRE_DEL_NEGOCIO,
  leerNombreDelNegocio,
  nombreCambio,
} from "./nombre-del-negocio"

describe("leerNombreDelNegocio", () => {
  it("devuelve el nombre sin los espacios de las puntas", () => {
    expect(leerNombreDelNegocio("  Salón Ana  ")).toEqual({ ok: true, nombre: "Salón Ana" })
  })

  it("respeta lo de adentro: tildes, mayúsculas y espacios entre palabras", () => {
    expect(leerNombreDelNegocio("Clínica  Dental Ñuñoa")).toEqual({ ok: true, nombre: "Clínica  Dental Ñuñoa" })
  })

  it("acepta justo el mínimo y justo el máximo", () => {
    expect(leerNombreDelNegocio("Ab").ok).toBe(true)
    expect(leerNombreDelNegocio("a".repeat(LARGO_MAXIMO_DEL_NOMBRE_DEL_NEGOCIO)).ok).toBe(true)
  })

  it("rechaza uno de menos de 2 caracteres, también si el resto son espacios", () => {
    expect(LARGO_MINIMO_DEL_NOMBRE_DEL_NEGOCIO).toBe(2)
    expect(leerNombreDelNegocio("A")).toEqual({ ok: false, error: MENSAJES_DEL_NOMBRE_DEL_NEGOCIO.muyCorto })
    expect(leerNombreDelNegocio("   ")).toEqual({ ok: false, error: MENSAJES_DEL_NOMBRE_DEL_NEGOCIO.muyCorto })
    expect(leerNombreDelNegocio("")).toEqual({ ok: false, error: MENSAJES_DEL_NOMBRE_DEL_NEGOCIO.muyCorto })
  })

  it("rechaza uno de más de 80 caracteres, contados después de recortar", () => {
    expect(LARGO_MAXIMO_DEL_NOMBRE_DEL_NEGOCIO).toBe(80)
    expect(leerNombreDelNegocio("a".repeat(81))).toEqual({ ok: false, error: MENSAJES_DEL_NOMBRE_DEL_NEGOCIO.muyLargo })
    expect(leerNombreDelNegocio(` ${"a".repeat(80)} `).ok).toBe(true)
  })

  it("lo que no es texto no se guarda", () => {
    expect(leerNombreDelNegocio(undefined)).toEqual({ ok: false, error: MENSAJES_DEL_NOMBRE_DEL_NEGOCIO.falta })
    expect(leerNombreDelNegocio(null)).toEqual({ ok: false, error: MENSAJES_DEL_NOMBRE_DEL_NEGOCIO.falta })
    for (const valor of [7, true, ["Salón"], { nombre: "Salón" }]) {
      expect(leerNombreDelNegocio(valor)).toEqual({ ok: false, error: MENSAJES_DEL_NOMBRE_DEL_NEGOCIO.noEsTexto })
    }
  })
})

describe("nombreCambio", () => {
  it("es un cambio cuando el nombre válido es otro", () => {
    expect(nombreCambio("Salón Ana", "Salón Ana Rosa")).toBe(true)
    expect(nombreCambio("salón ana", "Salón Ana")).toBe(true)
  })

  it("no lo es si sólo cambian los espacios de las puntas", () => {
    expect(nombreCambio("  Salón Ana ", "Salón Ana")).toBe(false)
    expect(nombreCambio("Salón Ana", "Salón Ana")).toBe(false)
  })

  it("no lo es si lo escrito no es válido: no hay nada que guardar", () => {
    expect(nombreCambio("", "Salón Ana")).toBe(false)
    expect(nombreCambio("A", "Salón Ana")).toBe(false)
    expect(nombreCambio("a".repeat(81), "Salón Ana")).toBe(false)
  })
})
