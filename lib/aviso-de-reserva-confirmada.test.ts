import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase } from "@/pruebas/datos"
import { MARCA_DE_CLIENTE_ELIMINADO } from "./clientes-eliminados"

const mockEnviar = vi.fn()

vi.mock("@/lib/email", () => ({
  enviarReservaConfirmadaPorElLocal: (...args: unknown[]) => mockEnviar(...args),
}))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return base.prisma
  },
}))

// 13:00 UTC del 20 de octubre de 2099 son las 10:00 en Santiago (horario de verano, UTC-3).
const INICIO = new Date("2099-10-20T13:00:00.000Z")

const cita = (id: string, datos: Record<string, unknown> = {}) => ({
  id,
  businessId: NEGOCIO,
  customerId: "c-lucia",
  memberId: "m-carla",
  title: "Corte",
  status: "confirmada",
  confirmacionPorFaltas: true,
  startTime: INICIO,
  endTime: new Date(INICIO.getTime() + 60 * 60 * 1000),
  ...datos,
})

beforeEach(() => {
  vi.clearAllMocks()
  mockEnviar.mockResolvedValue({ data: { id: "correo-1" }, error: null })
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    business: datos.business.map((negocio) => ({ ...negocio, timezone: "America/Santiago" })),
    customer: [
      ...datos.customer,
      { id: "c-lucia", businessId: NEGOCIO, name: "Lucía", lastName: "Pérez", email: "lucia@correo.test" },
      { id: "c-sin-correo", businessId: NEGOCIO, name: "Beto", lastName: null, email: null },
      { id: "c-eliminada", businessId: NEGOCIO, name: "Cliente eliminado", email: "quedo@correo.test", tags: [MARCA_DE_CLIENTE_ELIMINADO] },
    ],
    appointment: [
      cita("confirmada"),
      cita("sin-correo", { customerId: "c-sin-correo" }),
      cita("eliminada", { customerId: "c-eliminada" }),
      cita("todavia-pendiente", { status: "pendiente" }),
      cita("ajena", { businessId: OTRO_NEGOCIO, customerId: "c-ajeno", memberId: "m-ajeno" }),
    ],
  })
})

describe("enviarAvisoDeReservaConfirmada (#84)", () => {
  it("le escribe al cliente con el día y la hora en el reloj del negocio", async () => {
    const { enviarAvisoDeReservaConfirmada } = await import("./aviso-de-reserva-confirmada")

    expect(await enviarAvisoDeReservaConfirmada({ businessId: NEGOCIO, citaId: "confirmada" })).toBe(true)

    expect(mockEnviar).toHaveBeenCalledWith({
      emailCliente: "lucia@correo.test",
      nombreCliente: "Lucía Pérez",
      nombreNegocio: "Salón Uno",
      servicio: "Corte",
      fecha: "2099-10-20",
      hora: "10:00",
      profesional: "Carla Profesional",
      precio: null,
      rubro: "salon",
    })
  })

  it("el correo lleva el rubro del negocio de la cita, leído de la base", async () => {
    await base.prisma.business.updateMany({ where: { id: NEGOCIO }, data: { type: "odontologia" } })
    const { enviarAvisoDeReservaConfirmada } = await import("./aviso-de-reserva-confirmada")

    await enviarAvisoDeReservaConfirmada({ businessId: NEGOCIO, citaId: "confirmada" })

    expect(mockEnviar).toHaveBeenCalledWith(expect.objectContaining({ rubro: "odontologia" }))
  })

  it("#138: con el precio guardado en la cita (el rebajado, si fue en hora valle)", async () => {
    await base.prisma.appointment.updateMany({ where: { id: "confirmada" }, data: { price: 6400 } })
    const { enviarAvisoDeReservaConfirmada } = await import("./aviso-de-reserva-confirmada")

    await enviarAvisoDeReservaConfirmada({ businessId: NEGOCIO, citaId: "confirmada" })

    expect(mockEnviar).toHaveBeenCalledWith(expect.objectContaining({ precio: 6400 }))
  })

  it.each([
    ["una cita de otro negocio", { businessId: NEGOCIO, citaId: "ajena" }],
    ["el negocio de otra sesión", { businessId: OTRO_NEGOCIO, citaId: "confirmada" }],
    ["un cliente sin correo", { businessId: NEGOCIO, citaId: "sin-correo" }],
    ["un cliente eliminado", { businessId: NEGOCIO, citaId: "eliminada" }],
    ["una que ya no está confirmada", { businessId: NEGOCIO, citaId: "todavia-pendiente" }],
  ])("no escribe por %s", async (_caso, confirmada) => {
    const { enviarAvisoDeReservaConfirmada } = await import("./aviso-de-reserva-confirmada")

    expect(await enviarAvisoDeReservaConfirmada(confirmada)).toBe(false)
    expect(mockEnviar).not.toHaveBeenCalled()
  })

  it("si el envío falla, no lanza", async () => {
    mockEnviar.mockRejectedValueOnce(new Error("Resend caído"))
    const { enviarAvisoDeReservaConfirmada } = await import("./aviso-de-reserva-confirmada")

    expect(await enviarAvisoDeReservaConfirmada({ businessId: NEGOCIO, citaId: "confirmada" })).toBe(false)
  })
})

describe("enviarAvisoDeReservaConfirmada: dónde queda la hora (etapa 9)", () => {
  /** Un negocio Independiente (la dueña sola: sin equipo) con dos sedes activas y una cita confirmada en una. */
  const SOLO = "negocio-solo"

  function escenario(arreglos: { sedes?: Record<string, unknown>[]; cita?: Record<string, unknown>; plan?: string } = {}) {
    base.reiniciar({
      user: [
        { id: "u-solo", name: "Sofía Sola", email: "sofia@solo.test" },
        { id: "u-otra", name: "Otra Dueña", email: "otra@ajena.test" },
      ],
      business: [
        { id: SOLO, name: "Estudio Sofía", slug: "estudio-sofia", userId: "u-solo", plan: arreglos.plan ?? "independiente", timezone: "America/Santiago", type: "salon" },
        { id: OTRO_NEGOCIO, name: "Salón Dos", slug: "salon-dos", userId: "u-otra", plan: "independiente" },
      ],
      customer: [{ id: "c-lucia", businessId: SOLO, name: "Lucía", lastName: "Pérez", email: "lucia@correo.test" }],
      sede: arreglos.sedes ?? [
        { id: "sede-centro", businessId: SOLO, nombre: "Centro", direccion: "Calle 1 #23", comuna: "Santiago", telefono: "+56911112222" },
        { id: "sede-providencia", businessId: SOLO, nombre: "Providencia", direccion: "Av. Providencia 1234", comuna: "Providencia" },
        // Dato de otro negocio a propósito: no tiene que aparecer en ningún correo de éste.
        { id: "sede-ajena", businessId: OTRO_NEGOCIO, nombre: "Ajena", direccion: "Calle Ajena 9", comuna: "Otra" },
      ],
      appointment: [cita("confirmada", { businessId: SOLO, memberId: null, sedeId: "sede-providencia", ...arreglos.cita })],
    })
  }

  it("con varias sedes, el correo dice la de la cita: nombre, dirección y comuna, y nada más de la sede", async () => {
    escenario()
    const { enviarAvisoDeReservaConfirmada } = await import("./aviso-de-reserva-confirmada")

    expect(await enviarAvisoDeReservaConfirmada({ businessId: SOLO, citaId: "confirmada" })).toBe(true)

    expect(mockEnviar.mock.calls[0][0]).toMatchObject({
      lugar: { nombre: "Providencia", direccion: "Av. Providencia 1234", comuna: "Providencia" },
    })
    // Ni el id ni el teléfono ni la otra sede.
    expect(JSON.stringify(mockEnviar.mock.calls[0][0])).not.toMatch(/sede-|\+569|Ajena|Calle 1 #23/)
  })

  it("con una sola sede activa, el correo sale como siempre: sin `lugar`", async () => {
    escenario({
      sedes: [
        { id: "sede-centro", businessId: SOLO, nombre: "Centro", direccion: "Calle 1 #23", comuna: "Santiago", activo: false },
        { id: "sede-providencia", businessId: SOLO, nombre: "Providencia", direccion: "Av. Providencia 1234", comuna: "Providencia" },
      ],
    })
    const { enviarAvisoDeReservaConfirmada } = await import("./aviso-de-reserva-confirmada")

    await enviarAvisoDeReservaConfirmada({ businessId: SOLO, citaId: "confirmada" })

    expect(mockEnviar.mock.calls[0][0]).not.toHaveProperty("lugar")
  })

  it("sin sedes, el correo es exactamente el de siempre", async () => {
    escenario({ sedes: [], cita: { sedeId: null } })
    const { enviarAvisoDeReservaConfirmada } = await import("./aviso-de-reserva-confirmada")

    await enviarAvisoDeReservaConfirmada({ businessId: SOLO, citaId: "confirmada" })

    expect(mockEnviar.mock.calls[0][0]).not.toHaveProperty("lugar")
  })

  it("una cita sin sede, en un negocio con varias, sale como siempre", async () => {
    escenario({ cita: { sedeId: null } })
    const { enviarAvisoDeReservaConfirmada } = await import("./aviso-de-reserva-confirmada")

    await enviarAvisoDeReservaConfirmada({ businessId: SOLO, citaId: "confirmada" })

    expect(mockEnviar.mock.calls[0][0]).not.toHaveProperty("lugar")
  })

  it("la sede de la cita cuenta aunque se haya desactivado después, mientras queden varias activas", async () => {
    escenario({
      sedes: [
        { id: "sede-centro", businessId: SOLO, nombre: "Centro", direccion: "Calle 1 #23", comuna: "Santiago" },
        { id: "sede-sur", businessId: SOLO, nombre: "Sur", direccion: "Calle 3", comuna: "Maipú" },
        { id: "sede-providencia", businessId: SOLO, nombre: "Providencia", direccion: "Av. Providencia 1234", comuna: "Providencia", activo: false },
      ],
    })
    const { enviarAvisoDeReservaConfirmada } = await import("./aviso-de-reserva-confirmada")

    await enviarAvisoDeReservaConfirmada({ businessId: SOLO, citaId: "confirmada" })

    expect(mockEnviar.mock.calls[0][0]).toMatchObject({ lugar: { nombre: "Providencia" } })
  })
})
