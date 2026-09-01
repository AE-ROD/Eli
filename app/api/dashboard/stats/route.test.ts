import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const prismaMock = {
  appointment: {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    aggregate: vi.fn().mockResolvedValue({ _sum: { price: 1000 } }),
  },
  patient: {
    count: vi.fn().mockResolvedValue(0),
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

const fakeRequest = (): NextRequest => ({} as unknown as NextRequest)

describe("GET /api/dashboard/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.appointment.findMany.mockResolvedValue([])
    prismaMock.appointment.count.mockResolvedValue(0)
    prismaMock.appointment.aggregate.mockResolvedValue({ _sum: { price: 1000 } })
    prismaMock.patient.count.mockResolvedValue(0)
  })

  it("un worker no recibe ingresos del negocio", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await GET(fakeRequest())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).not.toHaveProperty("ingresoseMes")
    expect(data.tendencias).not.toHaveProperty("ingresos")
    // Tampoco se calcula: el endpoint no le pide el dato a Prisma.
    expect(prismaMock.appointment.aggregate).not.toHaveBeenCalled()
  })

  it("el dueño sí recibe los ingresos del negocio", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const res = await GET(fakeRequest())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.ingresoseMes).toBe(1000)
    expect(data.tendencias).toHaveProperty("ingresos")
  })

  it("sin sesión recibe 401", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await GET(fakeRequest())

    expect(res.status).toBe(401)
  })
})
