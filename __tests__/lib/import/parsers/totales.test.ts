import { describe, test, expect } from "vitest"
import { parsearTotales } from "@/lib/import/parsers/totales"
import type { PrismaClient } from "@prisma/client"

const prismaStub = {} as unknown as PrismaClient

describe("parsearTotales", () => {
  test("fila válida parsea correctamente", async () => {
    const filas = [{ periodo: "2024-01", metodo: "EFECTIVO", monto: "250.000" }]
    const res = await parsearTotales(filas, "biz-1", prismaStub)
    expect(res.ok).toHaveLength(1)
    expect(res.ok[0].data.montoDeclarado).toBe(250000)
  })

  test("monto con fórmula rota devuelve error", async () => {
    const filas = [{ periodo: "2024-01", metodo: "DEBITO", monto: "#VALUE!" }]
    const res = await parsearTotales(filas, "biz-1", prismaStub)
    expect(res.errores).toHaveLength(1)
  })

  test("sin período devuelve error", async () => {
    const filas = [{ periodo: "", metodo: "EFECTIVO", monto: "10.000" }]
    const res = await parsearTotales(filas, "biz-1", prismaStub)
    expect(res.errores).toHaveLength(1)
  })
})
