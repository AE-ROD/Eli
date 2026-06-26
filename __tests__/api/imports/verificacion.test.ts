import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    appointment: { findMany: vi.fn(), create: vi.fn() },
    patient: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    service: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    businessMember: { findMany: vi.fn() },
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

describe("Verificación totales/empleadas — no modifica DB", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user-1", businessId: "biz-1" },
    } as never)
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: unknown) =>
      (callback as (tx: typeof prisma) => Promise<unknown>)(prisma)
    )
    vi.mocked(prisma.dataImport.updateMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([
      { price: 50000 },
      { price: 30000 },
    ] as never)
    vi.mocked(prisma.businessMember.findMany).mockResolvedValue([
      { id: "m1", user: { name: "Ana López" } },
    ] as never)
  })

  it("totales: no crea Appointment ni Patient, retorna discrepancias", async () => {
    const response = await POST(request({
      importId: "import-totales",
      tipo: "totales",
      filas: [{ periodo: "2024-01", metodoPago: "EFECTIVO", montoDeclarado: "100.000" }],
    }))

    expect(response.status).toBe(200)
    const body = await response.json()

    // No debe escribir en DB
    expect(prisma.appointment.create).not.toHaveBeenCalled()
    expect(prisma.patient.create).not.toHaveBeenCalled()
    expect(prisma.patient.update).not.toHaveBeenCalled()
    expect(prisma.service.create).not.toHaveBeenCalled()
    expect(prisma.service.update).not.toHaveBeenCalled()

    // Retorna discrepancias con la diferencia calculada
    expect(body.discrepancias).toBeDefined()
    expect(body.discrepancias).toHaveLength(1)
    expect(body.discrepancias[0]).toMatchObject({
      etiqueta: expect.stringContaining("EFECTIVO"),
      declarado: 100000,
      real: 80000, // 50000 + 30000
      diferencia: 20000,
    })
  })

  it("empleadas: no crea Appointment ni Patient, retorna discrepancias", async () => {
    const response = await POST(request({
      importId: "import-empleadas",
      tipo: "empleadas",
      filas: [{ trabajadora: "Ana López", periodo: "2024-01", monto: "60.000" }],
    }))

    expect(response.status).toBe(200)
    const body = await response.json()

    // No debe escribir en DB
    expect(prisma.appointment.create).not.toHaveBeenCalled()
    expect(prisma.patient.create).not.toHaveBeenCalled()
    expect(prisma.patient.update).not.toHaveBeenCalled()
    expect(prisma.service.create).not.toHaveBeenCalled()
    expect(prisma.service.update).not.toHaveBeenCalled()

    // Retorna discrepancias
    expect(body.discrepancias).toBeDefined()
    expect(body.discrepancias).toHaveLength(1)
    expect(body.discrepancias[0]).toMatchObject({
      etiqueta: expect.stringContaining("Ana López"),
      declarado: 60000,
      real: 80000, // 50000 + 30000
      diferencia: -20000,
    })
  })
})
