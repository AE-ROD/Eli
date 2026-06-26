import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    business: { findUnique: vi.fn() },
    service: { findFirst: vi.fn() },
    businessMember: { findMany: vi.fn() },
    appointment: { findMany: vi.fn() },
    workSchedule: { findFirst: vi.fn() },
  },
}))

import { GET } from "@/app/api/reservar/[slug]/slots/route"
import { prisma } from "@/lib/prisma"

const FECHA = "2026-07-15"

function request() {
  return new NextRequest(`http://localhost/api/reservar/salon-demo/slots?fecha=${FECHA}&servicioId=svc-1`)
}

function setupCancunBusiness() {
  vi.mocked(prisma.business.findUnique).mockResolvedValue({
    id: "biz-1",
    timezone: "America/Cancun",
  } as never)
  vi.mocked(prisma.service.findFirst).mockResolvedValue({ duration: 60 } as never)
  vi.mocked(prisma.businessMember.findMany).mockResolvedValue([] as never)
  vi.mocked(prisma.workSchedule.findFirst).mockResolvedValue({
    startTime: "09:00",
    endTime: "12:00",
  } as never)
}

describe("booking slots timezone conversion", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupCancunBusiness()
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([] as never)
  })

  it("queries the UTC interval matching the business-local day in Cancun", async () => {
    await GET(request(), { params: Promise.resolve({ slug: "salon-demo" }) })

    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          startTime: {
            gte: new Date("2026-07-15T05:00:00.000Z"),
            lte: new Date("2026-07-16T04:59:59.000Z"),
          },
        }),
      })
    )
  })

  it("blocks the correct Cancun slot when the stored appointment is UTC", async () => {
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([
      {
        startTime: new Date("2026-07-15T15:00:00.000Z"),
        endTime: new Date("2026-07-15T16:00:00.000Z"),
      },
    ] as never)

    const response = await GET(request(), { params: Promise.resolve({ slug: "salon-demo" }) })

    expect(await response.json()).toEqual({ slots: ["09:00", "11:00"] })
  })
})
