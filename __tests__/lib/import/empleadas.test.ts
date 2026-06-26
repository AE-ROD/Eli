import { describe, expect, it } from "vitest"
import type { PrismaClient } from "@prisma/client"
import { parsearEmpleadas } from "@/lib/import/parsers/empleadas"

const prismaStub = {} as PrismaClient

describe("parsearEmpleadas", () => {
  it("parsea monto por trabajadora", async () => {
    const resultado = await parsearEmpleadas(
      [{ trabajadora: "Ana Soto", periodo: "2024-03", monto: "80.000" }],
      "biz-1",
      prismaStub
    )

    expect(resultado.ok).toHaveLength(1)
    expect(resultado.ok[0].data).toEqual({ trabajadora: "Ana Soto", periodo: "2024-03", monto: 80000 })
  })

  it("falta trabajadora devuelve error", async () => {
    const resultado = await parsearEmpleadas(
      [{ trabajadora: "", periodo: "2024-03", monto: "80.000" }],
      "biz-1",
      prismaStub
    )

    expect(resultado.errores).toHaveLength(1)
    expect(resultado.ok).toHaveLength(0)
  })
})
