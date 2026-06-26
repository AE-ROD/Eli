import { describe, expect, it, vi } from "vitest"
import type { PrismaClient } from "@prisma/client"
import { parsearDatosPersonal } from "@/lib/import/parsers/datosPersonal"

function prismaStub() {
  return {
    businessMember: {
      findMany: vi.fn(() => Promise.resolve([{ id: "member-1", user: { name: "Ana Soto" } }])),
    },
  } as unknown as PrismaClient
}

describe("parsearDatosPersonal", () => {
  it("parsea contacto de emergencia con match de miembro", async () => {
    const resultado = await parsearDatosPersonal(
      [{ nombre: "Ana Soto", contactoEmergenciaNombre: "Mamá Ana", contactoEmergenciaTelefono: "+56 9 3333 3333" }],
      "biz-1",
      prismaStub()
    )

    expect(resultado.ok).toHaveLength(1)
    expect(resultado.ok[0].data).toEqual({
      memberId: "member-1",
      emergencyContactName: "Mamá Ana",
      emergencyContactPhone: "+56 9 3333 3333",
    })
  })

  it("miembro sin match queda en sinMatch", async () => {
    const resultado = await parsearDatosPersonal(
      [{ nombre: "Persona Nueva", contactoEmergenciaNombre: "Contacto", contactoEmergenciaTelefono: "+56 9 3333 3333" }],
      "biz-1",
      prismaStub()
    )

    expect(resultado.ok).toHaveLength(0)
    expect(resultado.sinMatch).toHaveLength(1)
  })
})
