import { describe, expect, it } from "vitest"
import type { PrismaClient } from "@prisma/client"
import { parsearTotales } from "@/lib/import/parsers/totales"

const prismaStub = {} as PrismaClient

describe("parsearTotales", () => {
  it("parsea montos declarados por método", async () => {
    const resultado = await parsearTotales(
      [{ periodo: "2024-03", metodoPago: "EFECTIVO", montoDeclarado: "150.000" }],
      "biz-1",
      prismaStub
    )

    expect(resultado.ok).toHaveLength(1)
    expect(resultado.ok[0].data).toEqual({
      periodo: "2024-03",
      metodoPago: "EFECTIVO",
      montoDeclarado: 150000,
    })
  })

  it("monto roto devuelve error", async () => {
    const resultado = await parsearTotales(
      [{ periodo: "2024-03", metodoPago: "EFECTIVO", montoDeclarado: "texto" }],
      "biz-1",
      prismaStub
    )

    expect(resultado.errores).toHaveLength(1)
    expect(resultado.ok).toHaveLength(0)
  })
})
