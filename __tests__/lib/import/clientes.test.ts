import { describe, expect, it, vi } from "vitest"
import type { PrismaClient } from "@prisma/client"
import { parsearClientes } from "@/lib/import/parsers/clientes"

function prismaStub() {
  return {
    businessMember: {
      findMany: vi.fn(() => Promise.resolve([{ id: "member-1", user: { name: "Ana Soto" } }])),
    },
  } as unknown as PrismaClient
}

describe("parsearClientes", () => {
  it("parsea cliente con especialista", async () => {
    const resultado = await parsearClientes(
      [{ fecha: "05-03-2024", especialista: "Ana Soto", telefono: "+56 9 1234 5678", nombre: "Cliente Uno", email: "cliente@test.com" }],
      "biz-1",
      prismaStub()
    )

    expect(resultado.ok).toHaveLength(1)
    expect(resultado.ok[0].data).toEqual({
      patientName: "Cliente Uno",
      phone: "+56 9 1234 5678",
      email: "cliente@test.com",
      appointmentDate: new Date(2024, 2, 5),
      memberId: "member-1",
    })
  })

  it("fórmula rota en cualquier campo devuelve error", async () => {
    const resultado = await parsearClientes(
      [{ fecha: "05-03-2024", especialista: "Ana Soto", telefono: "#REF!", nombre: "Cliente Uno", email: "" }],
      "biz-1",
      prismaStub()
    )

    expect(resultado.ok).toHaveLength(0)
    expect(resultado.errores).toHaveLength(1)
  })
})
