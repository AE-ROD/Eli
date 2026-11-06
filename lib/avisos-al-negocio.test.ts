import { describe, it, expect } from "vitest"
import { destinatariosDelAviso } from "./avisos-al-negocio"

describe("destinatariosDelAviso (#104, #114)", () => {
  it("la dueña y cada profesional, sin los que no hay", () => {
    expect(destinatariosDelAviso("duena@uno.test", ["carla@uno.test", null, "pedro@uno.test"])).toEqual([
      "duena@uno.test",
      "carla@uno.test",
      "pedro@uno.test",
    ])
  })

  it("una casilla repetida (con otras mayúsculas o espacios) recibe un solo correo", () => {
    expect(destinatariosDelAviso("Duena@Uno.test", [" duena@uno.test ", "carla@uno.test", "CARLA@uno.test"])).toEqual([
      "Duena@Uno.test",
      "carla@uno.test",
    ])
  })
})
