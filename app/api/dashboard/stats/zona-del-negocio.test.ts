import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NEGOCIO, datosBase, sesiones } from "@/pruebas/datos"
import { crearBaseDeEstadisticas } from "./_pruebas/base-de-estadisticas"

/**
 * "Hoy", el mes y el día de la semana del inicio son los del negocio
 * (`Business.timezone`), no los del servidor (en Vercel, UTC). A las 21:30 en
 * Santiago, en UTC ya es mañana: "Citas de hoy" salía vacía, la próxima cita
 * era una de hoy y los clientes nuevos del mes cambiaban de mes antes de tiempo.
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseDeEstadisticas()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/** Jueves 15 de octubre de 2026, 21:30 en Santiago (UTC-3): en UTC ya es el viernes 16. */
const AHORA = new Date("2026-10-16T00:30:00.000Z")

const cita = (id: string, inicio: string) => ({
  id,
  businessId: NEGOCIO,
  customerId: "c-maria",
  memberId: "m-carla",
  title: "Corte",
  status: "confirmada",
  startTime: new Date(inicio),
  endTime: new Date(new Date(inicio).getTime() + 30 * 60_000),
})

async function estadisticas(sesion: unknown = sesiones.dueña) {
  const { GET } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return (await GET()).json()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
})

afterEach(() => vi.useRealTimers())

describe("GET /api/dashboard/stats: el día del negocio", () => {
  it("a las 21:30 en Santiago, las citas de hoy son las del jueves en Santiago, y la respuesta trae la zona", async () => {
    base.reiniciar({
      ...datosBase(),
      appointment: [
        // Jueves 10:00 y 20:00 en Santiago: de hoy. La de las 20:00 en UTC es del jueves; la de las 22:00 ya es viernes en UTC.
        cita("jueves-manana", "2026-10-15T13:00:00.000Z"),
        cita("jueves-noche", "2026-10-16T01:00:00.000Z"),
        // Viernes 10:00 en Santiago: de mañana, aunque en UTC sea "hoy".
        cita("viernes", "2026-10-16T13:00:00.000Z"),
      ],
    })

    const data = await estadisticas()

    expect(data.zona).toBe("America/Santiago")
    expect(data.citasHoy).toBe(2)
    expect((data.citasHoyLista as { id: string }[]).map((c) => c.id)).toEqual(["jueves-manana", "jueves-noche"])
  })

  it("sin citas el jueves, la próxima es la del viernes y no una del jueves por la noche", async () => {
    base.reiniciar({ ...datosBase(), appointment: [cita("viernes", "2026-10-16T13:00:00.000Z")] })

    const data = await estadisticas()

    expect(data.citasHoy).toBe(0)
    expect(data.proximaCita).toMatchObject({ id: "viernes" })
  })

  it("en otra zona del negocio, el mismo instante es otro día", async () => {
    const datos = datosBase()
    base.reiniciar({
      ...datos,
      business: datos.business.map((negocio) => (negocio.id === NEGOCIO ? { ...negocio, timezone: "UTC" } : negocio)),
      appointment: [cita("jueves-manana", "2026-10-15T13:00:00.000Z"), cita("viernes", "2026-10-16T13:00:00.000Z")],
    })

    const data = await estadisticas()

    expect(data.zona).toBe("UTC")
    expect((data.citasHoyLista as { id: string }[]).map((c) => c.id)).toEqual(["viernes"])
  })

  it("una zona guardada inválida cae en la de por defecto (Santiago), sin reventar", async () => {
    const datos = datosBase()
    base.reiniciar({
      ...datos,
      business: datos.business.map((negocio) => (negocio.id === NEGOCIO ? { ...negocio, timezone: "Mars/Olympus" } : negocio)),
      appointment: [cita("jueves-noche", "2026-10-16T01:00:00.000Z")],
    })

    const data = await estadisticas()

    expect(data.zona).toBe("America/Santiago")
    expect(data.citasHoy).toBe(1)
  })

  it("los clientes nuevos del mes empiezan el 1 de octubre en Santiago, no en UTC", async () => {
    // A las 23:00 del 30 de septiembre en Santiago (1 de octubre en UTC): de septiembre.
    vi.setSystemTime(new Date("2026-10-01T02:00:00.000Z"))
    const datos = datosBase()
    base.reiniciar({
      ...datos,
      customer: [
        { id: "c-septiembre", businessId: NEGOCIO, name: "Sofía", createdAt: new Date("2026-09-15T15:00:00.000Z") },
        { id: "c-agosto", businessId: NEGOCIO, name: "Ana", createdAt: new Date("2026-08-20T15:00:00.000Z") },
      ],
    })

    const data = await estadisticas()

    // Todavía es septiembre en Santiago: la del 15 de septiembre es nueva del mes. Con el
    // mes de UTC (octubre) no lo sería.
    expect(data.clientesNuevosMes).toBe(1)
    expect(data.totalClientes).toBe(2)
  })

  it("el horario del profesional es el del día de la semana del negocio (jueves), no el de UTC (viernes)", async () => {
    base.reiniciar({ ...datosBase() })

    await estadisticas(sesiones.carla)

    const llamada = base.prisma.workSchedule.findMany.mock.calls[0] as unknown as [{ where: { dayOfWeek: number } }]
    expect(llamada[0].where.dayOfWeek).toBe(4)
  })
})
