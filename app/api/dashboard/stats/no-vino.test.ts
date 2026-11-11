import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NEGOCIO, datosBase, sesiones } from "@/pruebas/datos"
import { crearBaseDeEstadisticas } from "./_pruebas/base-de-estadisticas"

/**
 * Las citas de hoy son las que ocupan su horario (#97): una cancelada o una
 * de "No vino" no cuenta, no sale en la lista del día (de la que salen los
 * huecos del profesional) ni es la próxima cita.
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseDeEstadisticas()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/** 15 de octubre de 2026, 12:00 en Santiago (UTC-3). */
const AHORA = new Date("2026-10-15T15:00:00.000Z")

const cita = (id: string, inicio: string, status: string) => ({
  id,
  businessId: NEGOCIO,
  customerId: "c-maria",
  memberId: "m-carla",
  title: "Corte",
  status,
  startTime: new Date(inicio),
  endTime: new Date(new Date(inicio).getTime() + 30 * 60_000),
})

async function estadisticas() {
  const { GET } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
  return (await GET()).json()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
})

afterEach(() => vi.useRealTimers())

describe("GET /api/dashboard/stats: las de \"No vino\" no son citas de hoy (#97)", () => {
  it("cuenta y lista sólo las que ocupan su horario", async () => {
    base.reiniciar({
      ...datosBase(),
      appointment: [
        cita("pendiente", "2026-10-15T16:00:00.000Z", "pendiente"),
        cita("no-vino", "2026-10-15T15:00:00.000Z", "no-asistio"),
        cita("cancelada", "2026-10-15T17:00:00.000Z", "cancelada"),
      ],
    })

    const data = await estadisticas()

    expect(data.citasHoy).toBe(1)
    expect((data.citasHoyLista as { id: string }[]).map((c) => c.id)).toEqual(["pendiente"])
  })

  it("si hoy sólo hubo una de \"No vino\", no hay citas hoy y la próxima no es otra de \"No vino\"", async () => {
    base.reiniciar({
      ...datosBase(),
      appointment: [
        cita("no-vino-hoy", "2026-10-15T15:00:00.000Z", "no-asistio"),
        cita("no-vino-manana", "2026-10-16T15:00:00.000Z", "no-asistio"),
        cita("pasado-manana", "2026-10-17T15:00:00.000Z", "confirmada"),
      ],
    })

    const data = await estadisticas()

    expect(data.citasHoy).toBe(0)
    expect(data.proximaCita.id).toBe("pasado-manana")
  })
})
