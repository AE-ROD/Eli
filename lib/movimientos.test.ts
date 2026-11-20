import { describe, expect, it } from "vitest"
import { errorDeMonto, montoDeLaOpcion, opcionesDeMovimiento, OPCIONES_DE_MOVIMIENTO, TIPOS_DE_MOVIMIENTO } from "@/lib/movimientos"

const opcion = (clave: string) => OPCIONES_DE_MOVIMIENTO.find((o) => o.clave === clave)!

describe("las opciones en palabras", () => {
  it("cada opción es uno de los tipos de siempre", () => {
    for (const o of OPCIONES_DE_MOVIMIENTO) expect(TIPOS_DE_MOVIMIENTO).toContain(o.tipo)
    expect(OPCIONES_DE_MOVIMIENTO.map((o) => o.texto)).toEqual([
      "Le adelanté plata",
      "Se llevó algo a cuenta (vale)",
      "Le descuento algo",
      "Le sumo un extra",
    ])
  })

  it("quien sólo maneja adelantos y vales no ve los ajustes", () => {
    expect(opcionesDeMovimiento(["adelanto", "vale"]).map((o) => o.clave)).toEqual(["adelanto", "vale"])
    expect(opcionesDeMovimiento(["adelanto", "vale", "ajuste"]).map((o) => o.clave)).toEqual(["adelanto", "vale", "descuento", "extra"])
    expect(opcionesDeMovimiento([])).toEqual([])
  })

  it("el signo lo pone la app: lo que se guarda es lo mismo que antes", () => {
    expect(montoDeLaOpcion(opcion("adelanto"), 5000)).toBe(5000)
    expect(montoDeLaOpcion(opcion("vale"), 5000)).toBe(5000)
    expect(montoDeLaOpcion(opcion("descuento"), 5000)).toBe(-5000)
    expect(montoDeLaOpcion(opcion("extra"), 5000)).toBe(5000)
    // Aunque alguien escriba el signo, manda la opción.
    expect(montoDeLaOpcion(opcion("descuento"), -5000)).toBe(-5000)
    expect(montoDeLaOpcion(opcion("extra"), -5000)).toBe(5000)
    expect(montoDeLaOpcion(opcion("adelanto"), -5000)).toBe(5000)
  })

  it("los montos con signo pasan la misma validación de siempre", () => {
    expect(errorDeMonto("ajuste", montoDeLaOpcion(opcion("descuento"), 5000))).toBeNull()
    expect(errorDeMonto("adelanto", montoDeLaOpcion(opcion("adelanto"), 5000))).toBeNull()
    expect(errorDeMonto("ajuste", montoDeLaOpcion(opcion("extra"), 0))).toBe("Un ajuste no puede ser de $0.")
  })
})
