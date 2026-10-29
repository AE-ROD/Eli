import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { confirmarReserva, inscribirEnListaDeEspera, salirDeLaListaDeEspera } from "./_datos"

/** Lo que la página pública manda al servidor para los consentimientos y la lista de espera. */

const mockFetch = vi.fn()

beforeEach(() => {
  mockFetch.mockReset()
  mockFetch.mockResolvedValue(new Response(JSON.stringify({ mensaje: "ok" }), { status: 200 }))
  vi.stubGlobal("fetch", mockFetch)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const cuerpo = () => JSON.parse(mockFetch.mock.calls[0][1].body as string)

const reserva = {
  servicioId: "s1",
  profesionalId: null,
  fecha: "2030-01-07",
  hora: "09:00",
  nombre: "Lucía",
  apellido: "Pérez",
  cedula: "",
  email: "",
  telefono: "",
  whatsapp: true,
  correoPromo: true,
  comentarios: "",
}

describe("confirmarReserva", () => {
  it("el consentimiento de correos sólo viaja con email", async () => {
    await confirmarReserva("uno", reserva)
    expect(cuerpo().correoPromoConsentimiento).toBeUndefined()
    mockFetch.mockClear()
    await confirmarReserva("uno", { ...reserva, email: "lucia@correo.test" })
    expect(cuerpo().correoPromoConsentimiento).toBe(true)
  })
})

describe("lista de espera", () => {
  it("inscribirse manda el día, el servicio y el contacto; WhatsApp sólo con teléfono", async () => {
    await inscribirEnListaDeEspera("salón uno", {
      servicioId: "s1",
      profesionalId: null,
      fecha: "2030-01-07",
      nombre: "Lucía",
      apellido: "Pérez",
      email: "lucia@correo.test",
      telefono: "",
      whatsapp: true,
    })
    expect(mockFetch.mock.calls[0][0]).toBe("/api/reservar/sal%C3%B3n%20uno/lista-de-espera")
    expect(cuerpo()).toEqual({
      servicioId: "s1",
      fecha: "2030-01-07",
      nombre: "Lucía",
      apellido: "Pérez",
      email: "lucia@correo.test",
    })
  })

  it("salir es un POST al token", async () => {
    await salirDeLaListaDeEspera("uno", "abc_-")
    expect(mockFetch).toHaveBeenCalledWith("/api/reservar/uno/lista-de-espera/abc_-", { method: "POST" })
  })
})
