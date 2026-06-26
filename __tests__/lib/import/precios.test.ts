import { describe, expect, it } from "vitest"
import type { PrismaClient } from "@prisma/client"
import { parsearPrecios } from "@/lib/import/parsers/precios"

const prismaStub = {} as PrismaClient

describe("parsearPrecios", () => {
  it("parsea una fila válida", async () => {
    const resultado = await parsearPrecios(
      [{ nombre: "Manicure", precio: "15.000", duracion: "45" }],
      "biz-1",
      prismaStub
    )

    expect(resultado.ok).toHaveLength(1)
    expect(resultado.ok[0].data).toEqual({ name: "Manicure", price: 15000, duration: 45 })
  })

  it("precio roto devuelve error sin excepción", async () => {
    const resultado = await parsearPrecios(
      [{ nombre: "Pedicure", precio: "#REF!", duracion: "60" }],
      "biz-1",
      prismaStub
    )

    expect(resultado.ok).toHaveLength(0)
    expect(resultado.errores).toHaveLength(1)
  })
})
