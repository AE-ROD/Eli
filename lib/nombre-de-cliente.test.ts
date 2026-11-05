import { describe, expect, it } from "vitest"
import { nombreCompletoDeCliente } from "./nombre-de-cliente"

describe("nombreCompletoDeCliente", () => {
  it("con el apellido aparte (clientes viejos de la reserva pública), los junta", () => {
    expect(nombreCompletoDeCliente({ name: "Lucía", lastName: "Pérez" })).toBe("Lucía Pérez")
  })

  it("con el nombre completo en `name` y sin apellido, lo deja igual", () => {
    expect(nombreCompletoDeCliente({ name: "Lucía Pérez", lastName: null })).toBe("Lucía Pérez")
    expect(nombreCompletoDeCliente({ name: "Lucía Pérez" })).toBe("Lucía Pérez")
  })

  it("un apellido vacío o con espacios no deja un espacio colgando", () => {
    expect(nombreCompletoDeCliente({ name: "Lucía", lastName: "  " })).toBe("Lucía")
    expect(nombreCompletoDeCliente({ name: " Lucía ", lastName: " Pérez " })).toBe("Lucía Pérez")
  })
})
