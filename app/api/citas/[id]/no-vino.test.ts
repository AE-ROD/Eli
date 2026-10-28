import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, atencion, conId, datosBase, pedido, sesiones } from "@/pruebas/datos"

/**
 * "No vino" (`no-asistio`): se marca en una reserva pendiente o confirmada
 * cuya hora ya pasó y cuyo cliente no está en el Tablero. Libera el horario
 * y cuenta como inasistencia en la ficha del cliente.
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const PASADA = { startTime: new Date("2026-10-20T13:00:00.000Z"), endTime: new Date("2026-10-20T14:00:00.000Z") }
const FUTURA = { startTime: new Date("2099-10-20T13:00:00.000Z"), endTime: new Date("2099-10-20T14:00:00.000Z") }

const cita = (id: string, datos: Record<string, unknown> = {}) => ({
  id,
  businessId: NEGOCIO,
  customerId: "c-maria",
  memberId: "m-carla",
  title: "Corte",
  status: "pendiente",
  ...PASADA,
  ...datos,
})

function escenario() {
  base.reiniciar({
    ...datosBase(),
    appointment: [
      cita("pendiente"),
      cita("confirmada", { status: "confirmada" }),
      cita("futura", FUTURA),
      cita("en-progreso", { status: "en-progreso" }),
      cita("completada", { status: "completada" }),
      cita("cancelada", { status: "cancelada" }),
      cita("ya-no-vino", { status: "no-asistio" }),
      cita("llego"),
      cita("llego-anulada"),
      cita("de-pedro", { memberId: "m-pedro" }),
      { ...cita("ajena"), businessId: OTRO_NEGOCIO, customerId: "c-ajeno", memberId: "m-ajeno" },
    ],
    visit: [
      atencion("v-llego", { appointmentId: "llego", status: "en-espera" }),
      atencion("v-anulada", { appointmentId: "llego-anulada", status: "anulada" }),
    ],
  })
}

async function noVino(sesion: unknown, id: string) {
  const { PUT } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return PUT(pedido(`http://localhost/api/citas/${id}`, { status: "no-asistio" }), conId(id))
}

const estado = (id: string) => base.buscar("appointment", { id })[0]?.status

describe("PUT /api/citas/[id]: marcar 'No vino'", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    escenario()
  })

  it.each(["pendiente", "confirmada"])("una reserva %s cuya hora pasó: queda 'no-asistio'", async (id) => {
    const res = await noVino(sesiones.dueña, id)

    expect(res.status).toBe(200)
    expect(estado(id)).toBe("no-asistio")
  })

  it("una que todavía no llega a su hora: 409, si avisó se cancela", async () => {
    const res = await noVino(sesiones.dueña, "futura")

    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/cancélala/)
    expect(estado("futura")).toBe("pendiente")
  })

  it.each(["en-progreso", "completada", "cancelada"])("desde %s no se marca: 409 y nada cambia", async (id) => {
    const antes = estado(id)
    const res = await noVino(sesiones.dueña, id)

    expect(res.status).toBe(409)
    expect(estado(id)).toBe(antes)
  })

  it("si el cliente ya está en el Tablero: 409", async () => {
    const res = await noVino(sesiones.dueña, "llego")

    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/ya llegó/)
    expect(estado("llego")).toBe("pendiente")
  })

  it("una atención anulada ya no la ata: se marca", async () => {
    expect((await noVino(sesiones.dueña, "llego-anulada")).status).toBe(200)
  })

  it("marcarla de nuevo no cambia nada ni falla", async () => {
    expect((await noVino(sesiones.dueña, "ya-no-vino")).status).toBe(200)
    expect(estado("ya-no-vino")).toBe("no-asistio")
  })

  it("el profesional marca la suya, no la de un colega (404, no 403)", async () => {
    expect((await noVino(sesiones.carla, "pendiente")).status).toBe(200)
    expect((await noVino(sesiones.carla, "de-pedro")).status).toBe(404)
    expect(estado("de-pedro")).toBe("pendiente")
  })

  it("una cita de otro negocio: 404 y nada cambia", async () => {
    const antes = base.volcado()
    const res = await noVino(sesiones.dueña, "ajena")

    expect(res.status).toBe(404)
    expect(base.volcado()).toEqual(antes)
  })

  it("una cita 'no vino' ya no se mueve", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const res = await PUT(
      pedido("http://localhost/api/citas/ya-no-vino", {
        startTime: "2026-10-21T13:00:00.000Z",
        endTime: "2026-10-21T14:00:00.000Z",
        confirmarAdvertencias: true,
      }),
      conId("ya-no-vino")
    )

    expect(res.status).toBe(409)
  })
})
