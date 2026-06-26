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

describe("POST /api/imports/confirm", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", businessId: "biz-1" },
    } as never)
    vi.mocked(prisma.businessMember.findFirst).mockResolvedValue({ id: "member-1" } as never)
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: unknown) =>
      (callback as (tx: typeof prisma) => Promise<unknown>)(prisma)
    )
    vi.mocked(prisma.dataImport.updateMany).mockResolvedValue({ count: 1 } as never)
  })

  it("persiste precios válidos y actualiza el import", async () => {
    vi.mocked(prisma.service.findFirst).mockResolvedValue(null)

    const response = await POST(request({
      importId: "import-1",
      tipo: "precios",
      filas: [{ nombre: "Manicure", precio: "15.000", duracion: "45" }],
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ rowsOk: 1, rowsErrored: 0, errores: [] })
    expect(prisma.service.create).toHaveBeenCalledWith({
      data: { businessId: "biz-1", name: "Manicure", price: 15000, duration: 45, active: true },
    })
    expect(prisma.dataImport.updateMany).toHaveBeenCalledWith({
      where: { id: "import-1", businessId: "biz-1" },
      data: { rowsImported: 1, rowsSkipped: 0 },
    })
  })

  it("persiste lista negra agregando tag no-agendar a paciente existente", async () => {
    vi.mocked(prisma.patient.findFirst).mockResolvedValue({
      id: "patient-1",
      tags: ["vip"],
    } as never)

    const response = await POST(request({
      importId: "import-1",
      tipo: "listaNegra",
      filas: [{ nombre: "Cliente Bloqueado", telefono: "+56912345678", motivo: "No pagó" }],
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ rowsOk: 1, rowsErrored: 0, errores: [] })
    expect(prisma.patient.update).toHaveBeenCalledWith({
      where: { id: "patient-1" },
      data: expect.objectContaining({
        name: "Cliente Bloqueado",
        tags: ["vip", "no-agendar"],
        notes: "No pagó",
      }),
    })
  })

  it("rechaza tipo inválido con 400", async () => {
    const response = await POST(request({
      importId: "import-1",
      tipo: "desconocido",
      filas: [],
    }))

    expect(response.status).toBe(400)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
