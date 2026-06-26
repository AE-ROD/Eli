import { vi, describe, it, expect, beforeEach } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    business: { findUnique: vi.fn() },
    businessMember: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock("bcryptjs", () => ({ default: { hash: vi.fn().mockResolvedValue("hashed") } }))

import { POST } from "@/app/api/auth/registro/route"
import { prisma } from "@/lib/prisma"

const PAYLOAD_BASE = {
  nombre: "Juan",
  email: "juan@test.com",
  contrasena: "password123",
  nombreNegocio: "Barbería Juan",
  tipoNegocio: "barberia",
}

function makeRequest(body: object) {
  return new NextRequest("http://localhost/api/auth/registro", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
}

describe("POST /api/auth/registro", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => callback(prisma))
  })

  it("returns 400 when email is already taken", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: "existing" } as never)

    const res = await POST(makeRequest(PAYLOAD_BASE))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/ya existe/i)
  })

  it("returns 400 with validation error for short password", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

    const res = await POST(makeRequest({ ...PAYLOAD_BASE, contrasena: "abc" }))

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe("Datos inválidos")
  })

  it("creates user and returns 200 with id and email", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null)   // email check
    vi.mocked(prisma.business.findUnique).mockResolvedValueOnce(null) // slug uniqueness
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: "new-user",
      name: "Juan",
      email: "juan@test.com",
      business: { id: "biz-1" },
    } as never)

    const res = await POST(makeRequest(PAYLOAD_BASE))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.email).toBe("juan@test.com")
    expect(body.id).toBe("new-user")
  })
})
