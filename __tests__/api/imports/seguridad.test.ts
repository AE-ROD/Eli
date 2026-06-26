import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    businessMember: { findFirst: vi.fn() },
    service: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    patient: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    dataImport: { updateMany: vi.fn() },
  },
}))

import { getServerSession } from "next-auth"
import { POST } from "@/app/api/imports/confirm/route"
import { prisma } from "@/lib/prisma"

function request(body: object) {
  return new NextRequest("http://localhost/api/imports/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("seguridad de /api/imports/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-A", businessId: "biz-A" },
    } as never)
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: unknown) =>
      (callback as (tx: typeof prisma) => Promise<unknown>)(prisma)
    )
    vi.mocked(prisma.service.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.dataImport.updateMany).mockResolvedValue({ count: 0 } as never)
  })

  it("no puede confirmar un import de otro negocio ni escribir con businessId ajeno", async () => {
    const response = await POST(request({
      importId: "import-de-biz-B",
      tipo: "precios",
      filas: [{ nombre: "Manicure", precio: "15.000", duracion: "45" }],
    }))

    expect(response.status).toBe(200)
    expect(prisma.dataImport.updateMany).toHaveBeenCalledWith({
      where: { id: "import-de-biz-B", businessId: "biz-A" },
      data: { rowsImported: 1, rowsSkipped: 0 },
    })
    expect(prisma.service.create).toHaveBeenCalledWith({
      data: { businessId: "biz-A", name: "Manicure", price: 15000, duration: 45, active: true },
    })
    expect(prisma.service.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ businessId: "biz-B" }),
      })
    )
  })
})
