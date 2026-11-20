import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  confirmarReserva,
  inscribirEnListaDeEspera,
  leerDisponibilidad,
  mensajeParaQuienReserva,
  MUCHOS_INTENTOS,
  noSePudoGuardarLaReserva,
  salirDeLaListaDeEspera,
  SIN_INTERNET,
} from "./_datos"

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
  servicioIds: ["s1"],
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

  it("manda los servicios en orden en servicioIds (#89a), sin precios ni duración", async () => {
    await confirmarReserva("uno", { ...reserva, servicioIds: ["s2", "s1"] })
    expect(cuerpo().servicioIds).toEqual(["s2", "s1"])
    expect(cuerpo()).not.toHaveProperty("servicioId")
    expect(cuerpo()).not.toHaveProperty("precio")
    expect(cuerpo()).not.toHaveProperty("duracion")
  })
})

describe("leerDisponibilidad (#89c)", () => {
  it("QA#26: un día sin ninguna hora posible lo dice, para no ofrecer la lista de espera", async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ slots: [], sinListaDeEspera: true }), { status: 200 }))
    expect(await leerDisponibilidad("uno", "2030-01-07", ["s1"], null)).toEqual({
      ok: true,
      datos: { horas: [], precios: [], sinListaDeEspera: true },
    })
  })

  it("sin `valle` (apagada, o un servidor de antes): las horas y ningún precio", async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ slots: ["09:00", "10:00"] }), { status: 200 }))
    expect(await leerDisponibilidad("uno", "2030-01-07", ["s1"], null)).toEqual({
      ok: true,
      datos: { horas: ["09:00", "10:00"], precios: [], sinListaDeEspera: false },
    })
  })

  it("con `valle`: las horas rebajadas con su precio", async () => {
    const valle = [{ hora: "10:00", precio: 6400, precioNormal: 8000, porcentaje: 20 }]
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ slots: ["09:00", "10:00"], valle }), { status: 200 }))
    expect(await leerDisponibilidad("uno", "2030-01-07", ["s1"], null)).toEqual({
      ok: true,
      datos: { horas: ["09:00", "10:00"], precios: valle, sinListaDeEspera: false },
    })
  })
})

describe("lista de espera", () => {
  it("inscribirse manda el día, los servicios en orden (#162) y el contacto; WhatsApp sólo con teléfono", async () => {
    await inscribirEnListaDeEspera("salón uno", {
      servicioIds: ["s2", "s1"],
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
      servicioIds: ["s2", "s1"],
      fecha: "2030-01-07",
      nombre: "Lucía",
      apellido: "Pérez",
      email: "lucia@correo.test",
    })
  })

  it("un 429 (por IP o por correo) llega al formulario dicho en claro: esperar un minuto (#133)", async () => {
    const datos = { servicioIds: ["s1"], profesionalId: null, fecha: "2030-01-07", nombre: "Lucía", apellido: "Pérez", email: "lucia@correo.test", telefono: "", whatsapp: false }
    mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Demasiadas solicitudes, intenta más tarde" }), { status: 429 }))
    expect(await inscribirEnListaDeEspera("uno", datos)).toEqual({ ok: false, error: MUCHOS_INTENTOS })
    // Sin cuerpo (un proxy): el texto propio de la acción, no uno del tope.
    mockFetch.mockResolvedValueOnce(new Response("", { status: 429 }))
    expect(await inscribirEnListaDeEspera("uno", datos)).toEqual({ ok: false, error: "No se pudo anotar en la lista de espera" })
  })

  it("el apellido es opcional: vacío o de puros espacios no se manda", async () => {
    const datos = { servicioIds: ["s1"], profesionalId: null, fecha: "2030-01-07", nombre: "Lucía", apellido: "  ", email: "lucia@correo.test", telefono: "", whatsapp: false }
    await inscribirEnListaDeEspera("uno", datos)
    expect(cuerpo()).not.toHaveProperty("apellido")
  })

  it("salir es un POST al token", async () => {
    await salirDeLaListaDeEspera("uno", "abc_-")
    expect(mockFetch).toHaveBeenCalledWith("/api/reservar/uno/lista-de-espera/abc_-", { method: "POST" })
  })
})

describe("mensajeParaQuienReserva: ningún error técnico a la vista", () => {
  const queHacer = noSePudoGuardarLaReserva("Salón Uno")

  it("los mensajes técnicos se cambian por lo que hay que hacer", () => {
    for (const tecnico of [
      "Error interno del servidor",
      "El pedido no es un JSON válido",
      "Datos inválidos",
      "Error al confirmar la reserva",
      "No encontrado",
      "Negocio no encontrado",
      "",
    ]) {
      expect(mensajeParaQuienReserva(tecnico, queHacer)).toBe(queHacer)
    }
    expect(queHacer).toBe(
      "No pudimos guardar tu reserva. Tus datos siguen acá: vuelve a apretar Confirmar en un minuto. Si sigue, escríbele a Salón Uno."
    )
  })

  it("muchos pedidos seguidos: esperar un minuto", () => {
    expect(mensajeParaQuienReserva("Demasiadas solicitudes, intenta más tarde", queHacer)).toBe(MUCHOS_INTENTOS)
    expect(mensajeParaQuienReserva("Demasiados intentos, intenta más tarde", queHacer)).toBe(MUCHOS_INTENTOS)
  })

  it("sin conexión: revisar internet", () => {
    expect(mensajeParaQuienReserva("Sin conexión con el servidor", queHacer)).toBe(SIN_INTERNET)
  })

  it("los mensajes que ya dicen qué hacer se quedan", () => {
    expect(mensajeParaQuienReserva("Algo cambió mientras reservabas. Vuelve a elegir la hora.", queHacer)).toBe(
      "Algo cambió mientras reservabas. Vuelve a elegir la hora."
    )
    expect(mensajeParaQuienReserva("El correo no es válido", queHacer)).toBe("El correo no es válido")
  })
})
