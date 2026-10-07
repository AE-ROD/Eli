import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const prismaMock = {
  appointment: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  visit: {
    count: vi.fn(),
  },
  visitPayment: {
    aggregate: vi.fn(),
  },
  customer: {
    count: vi.fn(),
  },
  workSchedule: {
    findMany: vi.fn(),
  },
}

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

const sesionDueño = {
  user: { id: "owner-1", role: "owner", businessId: "negocio-1", businessName: "Mi negocio" },
}

const sesionProfesional = {
  user: {
    id: "worker-1",
    role: "worker",
    businessId: "negocio-1",
    businessName: "Mi negocio",
    memberId: "member-worker-1",
  },
}

const fakeRequest = (): NextRequest => ({ url: "http://localhost/api/dashboard/stats" }) as unknown as NextRequest

/**
 * Lo que no es ingresos: citas de hoy, clientes y horario. Los ingresos se
 * prueban contra datos, con la base falsa, en `ingresos.test.ts`.
 */
describe("GET /api/dashboard/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.appointment.findMany.mockResolvedValue([])
    prismaMock.appointment.findFirst.mockResolvedValue(null)
    prismaMock.visitPayment.aggregate.mockResolvedValue({ _sum: { amountCents: 100000 } })
    prismaMock.visit.count.mockResolvedValue(4)
    prismaMock.customer.count.mockResolvedValue(0)
    prismaMock.workSchedule.findMany.mockResolvedValue([])
  })

  it("un worker sólo recibe en citasHoyLista sus propias citas, con tope", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    await GET(fakeRequest())

    const llamada = prismaMock.appointment.findMany.mock.calls[0][0] as {
      where: { AND: [Record<string, unknown>, Record<string, unknown>] }
      take: number
    }

    // `whereDeAgenda`, no `{ businessId }` a secas: es la fuga que cerró F-006
    // y que este endpoint (vecino de /api/citas) seguía teniendo.
    expect(llamada.where.AND[0]).toEqual({
      businessId: "negocio-1",
      memberId: "member-worker-1",
    })
    expect(llamada.take).toBe(200)
  })

  it("sin mes anterior con qué comparar, la tendencia no viaja", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    // Facturación del mes actual, nada el mes anterior: es un negocio nuevo.
    prismaMock.visitPayment.aggregate
      .mockResolvedValueOnce({ _sum: { amountCents: 100000 } })
      .mockResolvedValueOnce({ _sum: { amountCents: null } })

    const res = await GET(fakeRequest())
    const data = await res.json()

    // Ni `0` ni `null`: la clave no existe. Un `0` se muestra como
    // "+0% vs mes anterior" y se lee como un placeholder roto.
    expect(data.tendencias).not.toHaveProperty("ingresos")
    expect(data.tendencias).not.toHaveProperty("clientes")
    // Y no queda rastro de la comparación que medía un día contra un mes.
    expect(data.tendencias).not.toHaveProperty("citas")
    expect(data).not.toHaveProperty("tasaOcupacion")
  })

  it("con mes anterior, la tendencia sale de los datos y no de un valor por defecto", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    // 12 clientes hoy, 10 al cierre del mes pasado, 2 nuevos este mes.
    prismaMock.customer.count
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(2)

    const res = await GET(fakeRequest())
    const data = await res.json()

    expect(data.totalClientes).toBe(12)
    expect(data.clientesNuevosMes).toBe(2)
    expect(data.tendencias.clientes).toBe(20)
  })

  it("sin citas hoy, dice cuándo es la próxima en vez de un cero mudo", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    prismaMock.appointment.findFirst.mockResolvedValueOnce({
      id: "cita-1",
      title: "Corte",
      startTime: new Date("2026-09-07T13:00:00.000Z"),
    })

    const res = await GET(fakeRequest())
    const data = await res.json()

    expect(data.citasHoy).toBe(0)
    expect(data.proximaCita).toMatchObject({ id: "cita-1", title: "Corte" })
    // La próxima cita también respeta el aislamiento por profesional.
    const llamada = prismaMock.appointment.findFirst.mock.calls[0][0] as {
      where: { AND: unknown[] }
    }
    expect(llamada.where.AND[0]).toEqual({ businessId: "negocio-1" })
  })

  it("con citas hoy no se busca la próxima", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    prismaMock.appointment.findMany.mockResolvedValueOnce([
      { id: "cita-hoy", title: "Color", startTime: new Date(), endTime: new Date(), status: "confirmada", customer: null },
    ])

    const res = await GET(fakeRequest())
    const data = await res.json()

    expect(data.citasHoy).toBe(1)
    expect(data).not.toHaveProperty("proximaCita")
    expect(prismaMock.appointment.findFirst).not.toHaveBeenCalled()
  })

  it("un worker con horario activo hoy recibe horarioHoy con sus franjas", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)
    prismaMock.workSchedule.findMany.mockResolvedValueOnce([
      { startTime: "09:00", endTime: "13:00" },
      { startTime: "14:00", endTime: "18:00" },
    ])

    const res = await GET(fakeRequest())
    const data = await res.json()

    expect(data.horarioHoy).toEqual([
      { startTime: "09:00", endTime: "13:00" },
      { startTime: "14:00", endTime: "18:00" },
    ])

    const llamada = prismaMock.workSchedule.findMany.mock.calls[0][0] as {
      where: { businessId: string; memberId: string; active: boolean }
    }
    // Nunca el horario de otro: siempre el propio `memberId` del actor, sin
    // aceptar ninguno por querystring.
    expect(llamada.where.memberId).toBe("member-worker-1")
    expect(llamada.where.businessId).toBe("negocio-1")
    expect(llamada.where.active).toBe(true)
  })

  it("un worker sin horario cargado hoy no recibe la clave horarioHoy", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)
    prismaMock.workSchedule.findMany.mockResolvedValueOnce([])

    const res = await GET(fakeRequest())
    const data = await res.json()

    // Ni un rango inventado ni un array vacío como placeholder: la clave no viaja.
    expect(data).not.toHaveProperty("horarioHoy")
  })

  it("el dueño no recibe horarioHoy ni dispara la consulta de horarios", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const res = await GET(fakeRequest())
    const data = await res.json()

    expect(data).not.toHaveProperty("horarioHoy")
    expect(prismaMock.workSchedule.findMany).not.toHaveBeenCalled()
  })

  it("sin sesión recibe 401", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await GET(fakeRequest())

    expect(res.status).toBe(401)
  })
})
