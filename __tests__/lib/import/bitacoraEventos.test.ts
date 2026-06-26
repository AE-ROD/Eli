import { describe, expect, it, vi } from "vitest"
import type { PrismaClient } from "@prisma/client"
import { parsearBitacoraEventos } from "@/lib/import/parsers/bitacoraEventos"

function prismaStub() {
  return {
    businessMember: {
      findMany: vi.fn(() => Promise.resolve([{ id: "member-1", user: { name: "Ana Soto" } }])),
    },
  } as unknown as PrismaClient
}

describe("parsearBitacoraEventos", () => {
  it("parsea producción y no-show", async () => {
    const resultado = await parsearBitacoraEventos(
      [
        { tipo: "produccion", fecha: "05-03-2024", trabajadora: "Ana Soto", monto: "20.000" },
        { tipo: "no-show", fecha: "06-03-2024", nombre: "Cliente Ausente", telefono: "+56 9 1111 1111" },
      ],
      "biz-1",
      prismaStub()
    )

    expect(resultado.ok).toHaveLength(2)
    expect(resultado.ok.map((fila) => fila.data.tipo)).toEqual(["produccion", "noshow"])
  })

  it("monto roto en producción devuelve error", async () => {
    const resultado = await parsearBitacoraEventos(
      [{ tipo: "produccion", fecha: "05-03-2024", trabajadora: "Ana Soto", monto: "#REF!" }],
      "biz-1",
      prismaStub()
    )

    expect(resultado.ok).toHaveLength(0)
    expect(resultado.errores).toHaveLength(1)
  })
})
