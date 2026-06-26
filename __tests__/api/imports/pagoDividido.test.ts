import { beforeEach, describe, expect, it, vi } from "vitest"
import type { PrismaClient } from "@prisma/client"

import { parsearRegistro } from "@/lib/import/parsers/registro"

describe("parsearRegistro pago dividido", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("construye paymentBreakdown que suma al total", async () => {
    const prisma = {
      businessMember: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([{ id: "m1", user: { name: "Ana" } }]),
      },
    } as unknown as PrismaClient

    const resultado = await parsearRegistro([
      {
        fecha: "15-01-2024",
        especialista: "Ana",
        servicio: "Manicure",
        precio: "20.000",
        metodoPago: "DIVIDIDO",
        monto2: "8.000",
        metodoPago2: "DEBITO",
      },
    ], "biz-1", prisma)

    expect(resultado.ok).toHaveLength(1)
    const pago = resultado.ok[0].data
    expect(pago.price).toBe(20000)
    expect(pago.paymentMethod).toBe("DIVIDIDO")
    expect(pago.paymentBreakdown).toHaveLength(2)
    expect(pago.paymentBreakdown![0].amount + pago.paymentBreakdown![1].amount).toBe(pago.price)
    expect(pago.paymentBreakdown![1].method).toBe("DEBITO")
    expect(pago.paymentBreakdown![0].amount).toBe(12000)
  })
})
