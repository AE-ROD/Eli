import { describe, it, expect } from "vitest"
import { serviciosDeEjemplo } from "./servicios-de-ejemplo"
import { RUBROS } from "./rubros"
import { duracion, nombre, precioDeServicio } from "./campos-del-panel"

describe("serviciosDeEjemplo", () => {
  it.each(RUBROS.map((rubro) => rubro.id))("el rubro %s tiene de 4 a 6 servicios válidos para el panel", (rubro) => {
    const servicios = serviciosDeEjemplo(rubro)

    expect(servicios.length).toBeGreaterThanOrEqual(4)
    expect(servicios.length).toBeLessThanOrEqual(6)
    for (const servicio of servicios) {
      // Los mismos esquemas con que el panel crea y edita servicios: un
      // ejemplo que no se pudiera guardar desde el panel tampoco se crea acá.
      expect(nombre().safeParse(servicio.name).success).toBe(true)
      expect(duracion().safeParse(servicio.duration).success).toBe(true)
      expect(servicio.duration % 15).toBe(0)
      expect(precioDeServicio().safeParse(servicio.price).success).toBe(true)
      expect(servicio.price).toBeGreaterThan(0)
      expect(Number.isInteger(servicio.price)).toBe(true)
      expect(servicio.category.trim()).not.toBe("")
    }
  })

  it.each(RUBROS.map((rubro) => rubro.id))("en el rubro %s no hay dos servicios con el mismo nombre", (rubro) => {
    const nombres = serviciosDeEjemplo(rubro).map((servicio) => servicio.name)
    expect(new Set(nombres).size).toBe(nombres.length)
  })

  it.each(["salud", "otro", "", "constructor", "__proto__"])("un rubro desconocido (%j) no recibe servicios", (rubro) => {
    expect(serviciosDeEjemplo(rubro)).toEqual([])
  })

  it("devuelve copias: cambiar lo devuelto no cambia la próxima llamada", () => {
    const primera = serviciosDeEjemplo("barberia")
    primera[0].price = 1
    expect(serviciosDeEjemplo("barberia")[0].price).not.toBe(1)
  })
})
