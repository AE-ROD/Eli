import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, atencion, conId, pedido, sesiones } from "@/pruebas/datos"
import { citaDental, datosDeLaClinica, sesionesDentales } from "@/pruebas/clinica-con-sillones"

/**
 * Anular la atención de una cita que no se cobró la cancela. En una clínica
 * dental eso devuelve lo agendado en la cita a "por agendar", como cancelarla
 * desde la agenda (`lib/citas-de-la-clinica.ts`).
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const URL = "http://localhost/api/atenciones/x/anulacion"
const AHORA = new Date("2026-10-20T15:00:00.000Z")

function escenario() {
  base.reiniciar({
    ...datosDeLaClinica(),
    appointment: [citaDental("cita-carla", "2026-10-20", "10:00", "11:00", { status: "en-progreso", sillonId: "sl-1" })],
    visit: [atencion("v-carla", { status: "en-atencion", appointmentId: "cita-carla" })],
    evolucion: [
      { id: "ev-1", businessId: NEGOCIO, customerId: "c-maria", texto: "Anestesia", autorNombre: "Carla", appointmentId: "cita-carla" },
    ],
    planDeTratamiento: [{ id: "plan-1", businessId: NEGOCIO, customerId: "c-maria", version: 1, creadoPorNombre: "Carla" }],
    etapaDelPlan: [{ id: "et-1", businessId: NEGOCIO, planId: "plan-1", orden: 1, nombre: "Urgencia" }],
    prestacionDelPlan: [
      {
        id: "pr-1",
        businessId: NEGOCIO,
        etapaId: "et-1",
        orden: 1,
        nombre: "Endodoncia",
        valorCents: 18_000_000,
        estado: "agendada",
        appointmentId: "cita-carla",
      },
    ],
  })
}

async function anular(sesion: unknown, id: string) {
  const { POST } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return POST(pedido(URL, { motivo: "Se fue" }), conId(id))
}

const prestacion = () => base.buscar("prestacionDelPlan", { id: "pr-1" })[0]

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  escenario()
})

afterEach(() => vi.useRealTimers())

describe("POST /api/atenciones/[id]/anulacion en una clínica dental", () => {
  it("cancela la cita y la prestación agendada vuelve a por agendar; la evolución conserva la cita", async () => {
    const res = await anular(sesionesDentales.encargado, "v-carla")

    expect(res.status).toBe(200)
    expect(base.buscar("appointment", { id: "cita-carla" })[0].status).toBe("cancelada")
    expect(prestacion()).toMatchObject({ estado: "por-agendar", appointmentId: null })
    expect(base.buscar("evolucion", { id: "ev-1" })[0].appointmentId).toBe("cita-carla")
  })

  it("en un salón no se toca nada del plan", async () => {
    const res = await anular(sesiones.encargado, "v-carla")

    expect(res.status).toBe(200)
    expect(prestacion()).toMatchObject({ estado: "agendada", appointmentId: "cita-carla" })
  })
})
