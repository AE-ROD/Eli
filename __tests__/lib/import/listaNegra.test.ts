import { describe, expect, it } from "vitest"
import type { PrismaClient } from "@prisma/client"
import { parsearListaNegra } from "@/lib/import/parsers/listaNegra"

const prismaStub = {} as PrismaClient

describe("parsearListaNegra", () => {
  it("parsea una persona no agendar", async () => {
    const resultado = await parsearListaNegra(
      [{ nombre: "Cliente Bloqueado", telefono: "+56 9 2222 2222", email: "bloqueado@test.com", motivo: "No pagó" }],
      "biz-1",
      prismaStub
    )

    expect(resultado.ok).toHaveLength(1)
    expect(resultado.ok[0].data).toEqual({
      name: "Cliente Bloqueado",
      phone: "+56 9 2222 2222",
      email: "bloqueado@test.com",
      notes: "No pagó",
      tags: ["no-agendar"],
    })
  })

  it("falta nombre devuelve error", async () => {
    const resultado = await parsearListaNegra(
      [{ nombre: "", telefono: "+56 9 2222 2222", motivo: "No pagó" }],
      "biz-1",
      prismaStub
    )

    expect(resultado.errores).toHaveLength(1)
    expect(resultado.ok).toHaveLength(0)
  })
})
