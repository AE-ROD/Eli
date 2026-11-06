import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, conId, pedido } from "@/pruebas/datos"
import { datosDeLaClinica, sesionesDentales } from "@/pruebas/clinica-con-sillones"

/**
 * Borrar un servicio que es el origen de una prestación de algún plan de
 * tratamiento: la base lo impide (FK NO ACTION, P2003). En una clínica el 409
 * dice eso, no que tiene comisiones.
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

async function borrar(sesion: unknown, id: string) {
  const { DELETE } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return DELETE(pedido("http://localhost/api/configuracion/servicios/x"), conId(id))
}

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar({
    ...datosDeLaClinica(),
    planDeTratamiento: [{ id: "plan-1", businessId: NEGOCIO, customerId: "c-maria", version: 1, creadoPorNombre: "Ana" }],
    etapaDelPlan: [{ id: "et-1", businessId: NEGOCIO, planId: "plan-1", orden: 1, nombre: "Urgencia" }],
    prestacionDelPlan: [
      { id: "pr-1", businessId: NEGOCIO, etapaId: "et-1", orden: 1, nombre: "Corte", serviceId: "s-corte", valorCents: 800_000 },
    ],
    commissionRate: [{ id: "cr-1", businessId: NEGOCIO, memberId: "m-carla", serviceId: "s-color", percent: 40 }],
  })
})

describe("DELETE /api/configuracion/servicios/[id] en una clínica dental", () => {
  it("un servicio en un plan de tratamiento: 409 que lo dice, y no se borra", async () => {
    const res = await borrar(sesionesDentales.encargado, "s-corte")

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe(
      "Este servicio está en el plan de tratamiento de algún paciente. Desactívalo en vez de borrarlo: deja de ofrecerse y los planes lo conservan."
    )
    expect(base.buscar("service", { id: "s-corte" })).toHaveLength(1)
  })

  it("uno con comisiones y sin planes sigue con el mensaje de comisiones", async () => {
    const res = await borrar(sesionesDentales.dueña, "s-color")

    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain("comisiones configuradas")
  })

  it("uno sin nada colgando se borra", async () => {
    const res = await borrar(sesionesDentales.dueña, "s-peinado")

    expect(res.status).toBe(200)
    expect(base.buscar("service", { id: "s-peinado" })).toHaveLength(0)
  })
})
