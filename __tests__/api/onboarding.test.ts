import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    service: { count: vi.fn() },
    workSchedule: { count: vi.fn() },
    appointment: { count: vi.fn() },
    business: { findUnique: vi.fn() },
  },
}))

import { getServerSession } from "next-auth"
import { GET } from "@/app/api/dashboard/onboarding/route"
import { prisma } from "@/lib/prisma"

function setChecklistCounts(servicios: number, horarios: number, citas: number) {
  vi.mocked(prisma.service.count).mockResolvedValue(servicios)
  vi.mocked(prisma.workSchedule.count).mockResolvedValue(horarios)
  vi.mocked(prisma.appointment.count).mockResolvedValue(citas)
  vi.mocked(prisma.business.findUnique).mockResolvedValue({ slug: "salon-demo" } as never)
}

describe("GET /api/dashboard/onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue({
      user: { businessId: "biz-1" },
    } as never)
  })

  it("marks every checklist item pending for a new business", async () => {
    setChecklistCounts(0, 0, 0)

    const response = await GET()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      tieneServicio: false,
      tieneHorario: false,
      tienePrimeraCita: false,
      slug: "salon-demo",
    })
  })

  it("reports a partially completed checklist independently", async () => {
    setChecklistCounts(2, 1, 0)

    const response = await GET()

    expect(await response.json()).toEqual({
      tieneServicio: true,
      tieneHorario: true,
      tienePrimeraCita: false,
      slug: "salon-demo",
    })
  })

  it("marks onboarding complete once service, schedule, and first booking exist", async () => {
    setChecklistCounts(1, 1, 1)

    const response = await GET()

    expect(await response.json()).toEqual({
      tieneServicio: true,
      tieneHorario: true,
      tienePrimeraCita: true,
      slug: "salon-demo",
    })
  })
})
