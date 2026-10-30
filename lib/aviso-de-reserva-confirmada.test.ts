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
    })
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
