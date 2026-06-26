import { describe, expect, it, vi } from "vitest"
import type { PrismaClient } from "@prisma/client"
import { parsearRegistro } from "@/lib/import/parsers/registro"

function prismaStub() {
  return {
    businessMember: {
      findMany: vi.fn(({ where }: { where: { businessId: string } }) =>
        Promise.resolve(
          where.businessId === "biz-1"
            ? [{ id: "member-1", user: { name: "Ana Soto" } }]
            : []
        )
      ),
    },
  } as unknown as PrismaClient
}

describe("parsearRegistro", () => {
  it("parsea pago dividido y propina", async () => {
    const resultado = await parsearRegistro(
      [{
        especialista: "Ana Soto",
        servicio: "Color",
        precio: "40.000",
        metodoPago: "DIVIDIDO",
        propina: "2.000",
        metodoPago2: "EFECTIVO",
        monto2: "10.000",
      }],
      "biz-1",
      prismaStub()
    )

    expect(resultado.ok).toHaveLength(1)
    expect(resultado.ok[0].data).toEqual({
      title: "Color",
      memberId: "member-1",
      price: 40000,
      paymentMethod: "DIVIDIDO",
      paymentBreakdown: [
        { method: "DIVIDIDO", amount: 30000 },
        { method: "EFECTIVO", amount: 10000 },
      ],
      tipAmount: 2000,
    })
  })

  it("especialista sin match queda en sinMatch", async () => {
    const resultado = await parsearRegistro(
      [{ especialista: "Persona Nueva", servicio: "Corte", precio: "10.000", metodoPago: "EFECTIVO" }],
      "biz-1",
      prismaStub()
    )

    expect(resultado.ok).toHaveLength(0)
    expect(resultado.sinMatch).toHaveLength(1)
    expect(resultado.sinMatch[0].campo).toBe("especialista")
  })
})
