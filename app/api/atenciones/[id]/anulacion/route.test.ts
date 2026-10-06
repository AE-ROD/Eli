import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { crearBaseFalsa } from "../../_pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, atencion, conId, datosBase, linea, pago, pedido, sesiones } from "../../_pruebas/datos"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const URL = "http://localhost/api/atenciones/x/anulacion"
const AHORA = new Date("2026-10-06T15:00:00.000Z")

const cita = (id: string, status: string) => ({
  id,
  businessId: NEGOCIO,
  customerId: "c-maria",
  memberId: "m-carla",
  title: "Corte",
  price: 8000,
  status,
  startTime: new Date("2026-10-06T13:00:00.000Z"),
  endTime: new Date("2026-10-06T13:30:00.000Z"),
})

function escenario() {
  return {
    ...datosBase(),
    appointment: [cita("cita-abierta", "en-progreso"), cita("cita-cobrada", "completada")],
    visit: [
      atencion("v-por-cobrar", { status: "por-cobrar", appointmentId: "cita-abierta" }),
      atencion("v-espera"),
      atencion("v-cobrada", { status: "finalizada", paidAt: new Date("2026-10-06T14:00:00.000Z"), total: 8000, appointmentId: "cita-cobrada" }),
      atencion("v-anulada", { status: "anulada", voidedAt: new Date("2026-10-06T12:00:00.000Z") }),
      atencion("v-ajena", { businessId: OTRO_NEGOCIO, customerId: "c-ajeno", status: "finalizada", paidAt: new Date(), total: 9000 }),
    ],
    visitService: [
      linea("l-por-cobrar", "v-por-cobrar"),
      linea("l-espera", "v-espera"),
      linea("l-cobrada", "v-cobrada"),
      linea("l-ajena", "v-ajena", { memberId: "m-ajeno", serviceId: "s-ajeno" }),
    ],
    visitPayment: [pago("p-cobrada", "v-cobrada", "efectivo", 8000)],
  }
}

const atencionGuardada = (id: string) => base.buscar("visit", { id })[0]
const citaGuardada = (id: string) => base.buscar("appointment", { id })[0]

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  base.reiniciar(escenario())
})

afterEach(() => vi.useRealTimers())

async function anular(sesion: unknown, id: string, cuerpo?: unknown) {
  const { POST } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return POST(pedido(URL, cuerpo), conId(id))
}

describe("POST /api/atenciones/[id]/anulacion", () => {
  it("una atención de otro negocio da 404 y no escribe nada", async () => {
    const antes = base.volcado()

    const res = await anular(sesiones.dueña, "v-ajena", { motivo: "error" })

    expect(res.status).toBe(404)
    expect(base.volcado()).toEqual(antes)
    expect(base.prisma.$transaction).not.toHaveBeenCalled()
  })

  it("la profesional no anula, ni siquiera su propia atención: 401 y no escribe nada", async () => {
    const antes = base.volcado()

    const res = await anular(sesiones.carla, "v-espera", { motivo: "se fue" })

    expect(res.status).toBe(401)
    expect(base.volcado()).toEqual(antes)
  })

  it("la profesional ni ve la de un colega: 404", async () => {
    const res = await anular(sesiones.pedro, "v-espera")

    expect(res.status).toBe(404)
  })

  it("el encargado anula antes de cobrar: queda en el historial y la cita pasa a cancelada", async () => {
    const res = await anular(sesiones.encargado, "v-por-cobrar", { motivo: "Se fue sin esperar" })

    expect(res.status).toBe(200)
    expect(atencionGuardada("v-por-cobrar")).toMatchObject({
      status: "anulada",
      voidedAt: AHORA,
      voidedById: "u-encargado",
      voidReason: "Se fue sin esperar",
    })
    expect(citaGuardada("cita-abierta").status).toBe("cancelada")
    // No se borra nada: sigue ahí, anulada, con sus líneas.
    expect(base.buscar("visitService", { visitId: "v-por-cobrar" })).toHaveLength(1)
  })

  it("el encargado no anula lo ya cobrado: 401 y no escribe nada", async () => {
    const antes = base.volcado()

    const res = await anular(sesiones.encargado, "v-cobrada", { motivo: "error de caja" })

    expect(res.status).toBe(401)
    expect(base.volcado()).toEqual(antes)
  })

  it("la dueña anula lo ya cobrado: deja de sumar, conserva sus pagos y la cita sigue completada", async () => {
    const res = await anular(sesiones.dueña, "v-cobrada", { motivo: "Cobro duplicado" })

    expect(res.status).toBe(200)
    expect(atencionGuardada("v-cobrada")).toMatchObject({ status: "anulada", voidedById: "u-duena", total: 8000 })
    expect(base.buscar("visitPayment", { visitId: "v-cobrada" })).toHaveLength(1)
    expect(citaGuardada("cita-cobrada").status).toBe("completada")
  })

  it("el motivo es opcional", async () => {
    const res = await anular(sesiones.dueña, "v-espera")

    expect(res.status).toBe(200)
    expect(atencionGuardada("v-espera")).toMatchObject({ status: "anulada", voidReason: null })
  })

  it("lo anulado no se anula de nuevo: 409", async () => {
    const res = await anular(sesiones.dueña, "v-anulada")

    expect(res.status).toBe(409)
  })

  it("si la cobran mientras el encargado la anula, la anulación no pasa: 409", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.encargado)
    const original = base.prisma.visit.findFirst.getMockImplementation()!
    base.prisma.visit.findFirst.mockImplementationOnce(async (args) => {
      const leida = await original(args)
      await base.prisma.visit.updateMany({ where: { id: "v-por-cobrar" }, data: { status: "finalizada" } })
      return leida
    })

    const res = await POST(pedido(URL, {}), conId("v-por-cobrar"))

    expect(res.status).toBe(409)
    expect(atencionGuardada("v-por-cobrar").status).toBe("finalizada")
    expect(citaGuardada("cita-abierta").status).toBe("en-progreso")
  })

  it("sin sesión recibe 401", async () => {
    const res = await anular(null, "v-espera")

    expect(res.status).toBe(401)
  })
})
