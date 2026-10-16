import { describe, it, expect, beforeEach } from "vitest"
import { Prisma } from "@prisma/client"
import { crearBaseFalsa } from "./base-falsa"

/**
 * La base falsa sostiene los tests de aislamiento del tablero: si entendiera
 * mal un `where`, esos tests podrían pasar por la razón equivocada (F-018).
 * Acá se fija lo que sabe hacer y, sobre todo, que lanza ante lo que no sabe.
 */

const base = crearBaseFalsa()
const { prisma } = base

beforeEach(() => {
  base.reiniciar({
    business: [{ id: "n1", name: "Uno", slug: "uno", userId: "u1" }],
    user: [{ id: "u1", name: "Ana", email: "a@test" }],
    businessMember: [{ id: "m1", businessId: "n1", userId: "u1" }],
    appointment: [
      { id: "cita-1", businessId: "n1", title: "Corte", startTime: new Date(1), endTime: new Date(2), memberId: "m1" },
      { id: "cita-2", businessId: "n1", title: "Color", startTime: new Date(3), endTime: new Date(4) },
    ],
    visit: [
      { id: "v1", businessId: "n1", customerName: "María", appointmentId: "cita-1" },
      { id: "v2", businessId: "n1", customerName: "Beto", status: "finalizada", paidAt: new Date(10) },
    ],
    visitService: [
      { id: "l1", visitId: "v1", serviceName: "Corte", memberId: "m1", professionalName: "Ana", priceCents: 1000 },
      { id: "l2", visitId: "v1", serviceName: "Color", byOwner: true, professionalName: "Ana", priceCents: 2000 },
    ],
  })
})

describe("base falsa: lo que entiende", () => {
  it("AND, OR, igualdad, in y rangos de fecha", async () => {
    const encontradas = await prisma.visit.findMany({
      where: {
        AND: [
          { businessId: "n1" },
          { OR: [{ status: { in: ["en-espera"] } }, { status: "finalizada", paidAt: { gte: new Date(5), lt: new Date(20) } }] },
        ],
      },
    })

    expect(encontradas.map((v) => v.id)).toEqual(["v1", "v2"])
  })

  it("`in` vacío no matchea nada, como la negación de lib/permisos", async () => {
    expect(await prisma.visit.findMany({ where: { id: { in: [] } } })).toEqual([])
  })

  it("filtros por relación: some, is y is null", async () => {
    const conLineaDeM1 = await prisma.visit.findMany({ where: { services: { some: { memberId: "m1" } } } })
    const deCitaDeM1 = await prisma.visit.findMany({ where: { appointment: { is: { memberId: "m1" } } } })
    const citasSinAtencion = await prisma.appointment.findMany({ where: { visit: { is: null } } })

    expect(conLineaDeM1.map((v) => v.id)).toEqual(["v1"])
    expect(deCitaDeM1.map((v) => v.id)).toEqual(["v1"])
    expect(citasSinAtencion.map((c) => c.id)).toEqual(["cita-2"])
  })

  it("un select anidado con where trae sólo los hijos que cumplen", async () => {
    const atencion = (await prisma.visit.findFirst({
      where: { id: "v1" },
      select: { id: true, services: { where: { memberId: "m1" }, select: { id: true } } },
    })) as { services: { id: string }[] }

    expect(atencion.services).toEqual([{ id: "l1" }])
  })

  it("una transacción que lanza deja la base como estaba", async () => {
    const antes = base.volcado()

    await expect(
      prisma.$transaction(async (tx: typeof prisma) => {
        await tx.visit.updateMany({ where: { id: "v1" }, data: { status: "anulada" } })
        throw new Error("algo falló")
      })
    ).rejects.toThrow("algo falló")

    expect(base.volcado()).toEqual(antes)
  })

  it("respeta `appointmentId` único y las claves foráneas, con los códigos de Prisma", async () => {
    const duplicada = prisma.visit.create({ data: { businessId: "n1", customerName: "X", appointmentId: "cita-1" } })
    const sinNegocio = prisma.visit.create({ data: { businessId: "no-existe", customerName: "X" } })

    await expect(duplicada).rejects.toMatchObject({ code: "P2002" })
    await expect(duplicada).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    await expect(sinNegocio).rejects.toMatchObject({ code: "P2003" })
  })
})

describe("base falsa: lanza ante lo que no entiende (F-018)", () => {
  it.each([
    ["un operador desconocido", { customerName: { contains: "Mar" } }],
    ["un campo que no existe", { nombre: "María" }],
    ["NOT", { NOT: [{ status: "anulada" }] }],
    ["un operador de relación desconocido", { services: { algunos: { memberId: "m1" } } }],
    ["OR sin lista", { OR: { status: "anulada" } }],
  ])("%s", async (_caso, where) => {
    await expect(prisma.visit.findMany({ where })).rejects.toThrow(/base falsa/)
  })

  it("un select de un campo que no existe", async () => {
    await expect(prisma.visit.findMany({ select: { nombre: true } })).rejects.toThrow(/base falsa/)
  })

  it("una escritura anidada que no sea { create }", async () => {
    await expect(
      prisma.visit.create({ data: { businessId: "n1", customerName: "X", services: { connect: [{ id: "l1" }] } } })
    ).rejects.toThrow(/base falsa/)
  })
})
