import { describe, expect, it } from "vitest"
import type { PrismaClient } from "@prisma/client"
import { parsearCajaChica } from "@/lib/import/parsers/cajaChica"

const prismaStub = {} as PrismaClient

describe("parsearCajaChica", () => {
  it("agrupa gastos y denominaciones del mismo día", async () => {
    const resultado = await parsearCajaChica(
      [
        { fecha: "05-03-2024", apertura: "10.000", cierre: "20.000", descripcionGasto: "Café", montoGasto: "1.500", denominacion: "1000", cantidad: "2" },
        { fecha: "05-03-2024", apertura: "10.000", cierre: "20.000", descripcionGasto: "Taxi", montoGasto: "3.000", denominacion: "500", cantidad: "4" },
      ],
      "biz-1",
      prismaStub
    )

    expect(resultado.ok).toHaveLength(1)
    expect(resultado.ok[0].data.expenses).toHaveLength(2)
    expect(resultado.ok[0].data.denominations).toHaveLength(2)
  })

  it("monto roto devuelve error", async () => {
    const resultado = await parsearCajaChica(
      [{ fecha: "05-03-2024", apertura: "#REF!", cierre: "20.000" }],
      "biz-1",
      prismaStub
    )

    expect(resultado.ok).toHaveLength(0)
    expect(resultado.errores).toHaveLength(1)
  })
})
