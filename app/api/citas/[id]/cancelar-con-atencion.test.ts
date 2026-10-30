import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, atencion, conId, datosBase, pedido, sesiones } from "@/pruebas/datos"

/**
 * Cancelar desde la agenda una cita cuyo cliente ya llegó (#136): la
 * atención quedaría colgando de una cita cancelada. Como en las por confirmar
 * (#84), 409 "anúlala primero en el Tablero", y la condición va en la misma
 * escritura: una llegada que entra entretanto tampoco se cuela.
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockAvisarHoraLiberada = vi.fn()
vi.mock("@/lib/lista-de-espera", () => ({
  programarAvisoDeHoraLiberada: (...args: unknown[]) => mockAvisarHoraLiberada(...args),
}))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return base.prisma
  },
}))

const MENSAJE = "Esta cita ya tiene una atención en el Tablero: anúlala ahí primero"
const FUTURA = { startTime: new Date("2099-10-20T13:00:00.000Z"), endTime: new Date("2099-10-20T14:00:00.000Z") }

const cita = (id: string, datos: Record<string, unknown> = {}) => ({
  id,
  businessId: NEGOCIO,
  customerId: "c-maria",
  memberId: "m-carla",
  title: "Corte",
  status: "pendiente",
  ...FUTURA,
  ...datos,
})

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar({
    ...datosBase(),
    appointment: [
      cita("pendiente-llego"),
      cita("confirmada-llego", { status: "confirmada" }),
      cita("llego-anulada"),
      cita("sin-atencion"),
      { ...cita("ajena"), businessId: OTRO_NEGOCIO, customerId: "c-ajeno", memberId: "m-ajeno" },
    ],
    visit: [
      atencion("v-pendiente", { appointmentId: "pendiente-llego", status: "en-espera" }),
      atencion("v-confirmada", { appointmentId: "confirmada-llego", status: "en-atencion" }),
      atencion("v-anulada", { appointmentId: "llego-anulada", status: "anulada" }),
    ],
  })
})

async function cancelar(sesion: unknown, id: string, extra: Record<string, unknown> = {}) {
  const { PUT } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const respuesta = await PUT(pedido(`http://localhost/api/citas/${id}`, { status: "cancelada", ...extra }), conId(id))
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const guardada = (id: string) => base.buscar("appointment", { id })[0]

describe("PUT /api/citas/[id]: cancelar una cita con atención viva (#136)", () => {
  it.each(["pendiente-llego", "confirmada-llego"])("%s: 409, no se cancela ni libera la hora", async (id) => {
    const antes = guardada(id).status
    const { status, cuerpo } = await cancelar(sesiones.dueña, id)
    expect(status).toBe(409)
    expect(cuerpo.error).toBe(MENSAJE)
    expect(guardada(id).status).toBe(antes)
    expect(guardada(id).notes ?? null).toBeNull()
    expect(mockAvisarHoraLiberada).not.toHaveBeenCalled()
  })

  it("tampoco se cuelan otros cambios que venían con la cancelación", async () => {
    const { status } = await cancelar(sesiones.encargado, "pendiente-llego", { notes: "Avisó que no viene" })
    expect(status).toBe(409)
    expect(guardada("pendiente-llego").notes ?? null).toBeNull()
  })

  it("el profesional, en su propia cita, tampoco", async () => {
    const { status, cuerpo } = await cancelar(sesiones.carla, "pendiente-llego")
    expect(status).toBe(409)
    expect(cuerpo.error).toBe(MENSAJE)
  })

  it("con la atención anulada se cancela, y libera la hora", async () => {
    const { status, cuerpo } = await cancelar(sesiones.dueña, "llego-anulada")
    expect(status).toBe(200)
    expect(cuerpo).toMatchObject({ id: "llego-anulada", status: "cancelada", customer: { id: "c-maria" } })
    expect(guardada("llego-anulada").status).toBe("cancelada")
    expect(mockAvisarHoraLiberada).toHaveBeenCalledTimes(1)
  })

  it("sin atención se cancela como siempre", async () => {
    expect((await cancelar(sesiones.dueña, "sin-atencion")).status).toBe(200)
    expect(guardada("sin-atencion").status).toBe("cancelada")
  })

  it("si el cliente llega entre la lectura y la escritura: 409, no queda cancelada con su atención viva", async () => {
    const original = base.prisma.appointment.findFirst.getMockImplementation()!
    base.prisma.appointment.findFirst.mockImplementationOnce(async (args) => {
      const leida = await original(args)
      await base.prisma.visit.create({ data: atencion("v-entretanto", { appointmentId: "sin-atencion", status: "en-espera" }) })
      return leida
    })

    const { status, cuerpo } = await cancelar(sesiones.dueña, "sin-atencion")

    expect(status).toBe(409)
    expect(cuerpo.error).toBe(MENSAJE)
    expect(guardada("sin-atencion").status).toBe("pendiente")
  })

  it("la cita de otro negocio es 404 y no se toca", async () => {
    expect((await cancelar(sesiones.dueña, "ajena")).status).toBe(404)
    expect((await cancelar(sesiones.dueñoAjeno, "pendiente-llego")).status).toBe(404)
    expect(guardada("ajena").status).toBe("pendiente")
    expect(guardada("pendiente-llego").status).toBe("pendiente")
  })

  it("la escritura que cancela va acotada al negocio de la sesión", async () => {
    await cancelar(sesiones.dueña, "sin-atencion")
    expect(base.prisma.appointment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "sin-atencion", businessId: NEGOCIO }) })
    )
  })
})
