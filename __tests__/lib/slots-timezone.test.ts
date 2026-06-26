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

async function slotsParaTimezone(timezone: string) {
  vi.mocked(prisma.business.findUnique).mockResolvedValue({ id: "biz-1", timezone } as never)

  const response = await GET(request(), { params: Promise.resolve({ slug: "salon-demo" }) })

  return response.json() as Promise<{ slots: string[] }>
}

describe("slots disponibles por timezone del negocio", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.service.findFirst).mockResolvedValue({ duration: 60 } as never)
    vi.mocked(prisma.businessMember.findMany).mockResolvedValue([] as never)
    vi.mocked(prisma.workSchedule.findFirst).mockResolvedValue({
      startTime: "09:00",
      endTime: "12:00",
    } as never)
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([
      {
        startTime: new Date("2026-07-15T15:00:00.000Z"),
        endTime: new Date("2026-07-15T16:00:00.000Z"),
      },
    ] as never)
  })

  it("con la misma cita UTC bloquea horarios distintos en Cancún y Santiago", async () => {
    const cancun = await slotsParaTimezone("America/Cancun")
    const santiago = await slotsParaTimezone("America/Santiago")

    expect(cancun.slots).toEqual(["09:00", "11:00"])
    expect(santiago.slots).toEqual(["09:00", "10:00"])
    expect(cancun.slots).not.toEqual(santiago.slots)
  })
})
