import { vi, describe, it, expect } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    business: { findUnique: vi.fn() },
    service: { findFirst: vi.fn() },
    businessMember: { findMany: vi.fn() },
    appointment: { findMany: vi.fn() },
    workSchedule: { findMany: vi.fn() },
  },
}))

import { GET } from "@/app/api/reservar/[slug]/route"
import { prisma } from "@/lib/prisma"

function makeRequest(slug: string) {
  return new NextRequest(`http://localhost/api/reservar/${slug}`)
}

describe("GET /api/reservar/[slug]", () => {
  it("returns 404 when slug does not exist", async () => {
    vi.mocked(prisma.business.findUnique).mockResolvedValue(null)

    const res = await GET(makeRequest("nonexistent-slug"), {
      params: Promise.resolve({ slug: "nonexistent-slug" }),
    })

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBeTruthy()
  })

  it("returns business data when slug exists", async () => {
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz-1",
      name: "Barbería Test",
      type: "barberia",
      slug: "barberia-test",
      timezone: "America/Cancun",
      services: [{ id: "svc-1", name: "Corte", duration: 30, price: 150, active: true, description: null }],
      workSchedules: [{ dayOfWeek: 1, startTime: "09:00", endTime: "18:00", active: true }],
      members: [],
    } as never)

    const res = await GET(makeRequest("barberia-test"), {
      params: Promise.resolve({ slug: "barberia-test" }),
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.name).toBe("Barbería Test")
    expect(body.services).toHaveLength(1)
  })
})
