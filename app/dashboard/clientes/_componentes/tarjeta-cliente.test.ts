import { describe, expect, it } from "vitest"
import type { Cliente } from "../_datos"
import { clienteParaTarjeta } from "./tarjeta-cliente"

const CLIENTE: Cliente = {
  id: "c",
  name: "Lucía",
  lastName: "Pérez",
  email: null,
  phone: null,
  tags: [],
  notes: null,
  whatsappConsentAt: null,
  correoPromoConsentAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  appointments: [],
  visitas: 0,
  inasistencias: 0,
  ultimaVisita: null,
  proximaCita: null,
}

describe("clienteParaTarjeta: el nombre", () => {
  it("con el apellido aparte (clientes viejos de la reserva pública), la tarjeta y la ficha muestran los dos", () => {
    expect(clienteParaTarjeta(CLIENTE).nombre).toBe("Lucía Pérez")
  })

  it("con el nombre completo en `name`, lo muestra tal cual", () => {
    expect(clienteParaTarjeta({ ...CLIENTE, name: "Lucía Pérez", lastName: null }).nombre).toBe("Lucía Pérez")
  })
})
