import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

let m: typeof import("./salidas-del-equipo")
beforeAll(async () => {
  m = await import("./salidas-del-equipo")
})

const AHORA = new Date("2026-11-22T15:00:00.000Z")
const haceDias = (dias: number) => new Date(AHORA.getTime() - dias * 24 * 60 * 60 * 1000)

type Registro = Record<string, unknown>

const usuario = (id: string): Registro => ({ id, email: `${id}@eli.test`, name: id })
const negocio = (id: string, name: string, userId: string): Registro => ({ id, name, slug: id, userId })
const membresia = (id: string, businessId: string, userId: string, archivadoEn: Date | null): Registro => ({
  id,
  businessId,
  userId,
  archivadoEn,
})

/** Dueñas de cada negocio, la persona a la que sacan (`u-ana`) y otra cuenta (`u-otra`). */
function escenario(miembros: Registro[], negocios: Registro[] = []) {
  base.reiniciar({
    user: [usuario("u-d1"), usuario("u-d2"), usuario("u-d3"), usuario("u-d4"), usuario("u-ana"), usuario("u-otra")],
    business: [
      negocio("b-1", "Salón Demo", "u-d1"),
      negocio("b-2", "Barbería Central", "u-d2"),
      negocio("b-3", "Uñas Lindas", "u-d3"),
      negocio("b-4", "Spa Sur", "u-d4"),
      ...negocios,
    ],
    businessMember: miembros,
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe("negociosDeLosQueSalio: de qué equipos sacaron a la cuenta hace poco", () => {
  it("archivada hace poco: aparece, sólo con el nombre del negocio", async () => {
    escenario([membresia("m-1", "b-1", "u-ana", haceDias(2))])
    expect(await m.negociosDeLosQueSalio("u-ana", AHORA)).toEqual(["Salón Demo"])
  })

  it("archivada hace 60 días: ya no se avisa", async () => {
    escenario([membresia("m-1", "b-1", "u-ana", haceDias(60))])
    expect(await m.negociosDeLosQueSalio("u-ana", AHORA)).toEqual([])
  })

  it("el límite son 30 días: a los 29 todavía, a los 31 ya no", async () => {
    escenario([membresia("m-1", "b-1", "u-ana", haceDias(29)), membresia("m-2", "b-2", "u-ana", haceDias(31))])
    expect(await m.negociosDeLosQueSalio("u-ana", AHORA)).toEqual(["Salón Demo"])
  })

  it("membresía activa: no aparece", async () => {
    escenario([membresia("m-1", "b-1", "u-ana", null)])
    expect(await m.negociosDeLosQueSalio("u-ana", AHORA)).toEqual([])
  })

  it("la salida de otra cuenta jamás se le muestra a ésta", async () => {
    escenario([membresia("m-1", "b-1", "u-otra", haceDias(1)), membresia("m-2", "b-2", "u-ana", haceDias(3))])
    expect(await m.negociosDeLosQueSalio("u-ana", AHORA)).toEqual(["Barbería Central"])
    expect(await m.negociosDeLosQueSalio("u-otra", AHORA)).toEqual(["Salón Demo"])
    expect(await m.negociosDeLosQueSalio("u-d1", AHORA)).toEqual([])
  })

  it("varias: como máximo 3, la más reciente primero", async () => {
    escenario([
      membresia("m-1", "b-1", "u-ana", haceDias(10)),
      membresia("m-2", "b-2", "u-ana", haceDias(1)),
      membresia("m-3", "b-3", "u-ana", haceDias(20)),
      membresia("m-4", "b-4", "u-ana", haceDias(5)),
    ])
    expect(await m.negociosDeLosQueSalio("u-ana", AHORA)).toEqual(["Barbería Central", "Spa Sur", "Salón Demo"])
  })

  it("no cuenta el negocio del que la cuenta es dueña", async () => {
    escenario(
      [membresia("m-1", "b-propio", "u-ana", haceDias(1)), membresia("m-2", "b-1", "u-ana", haceDias(2))],
      [negocio("b-propio", "Lo de Ana", "u-ana")]
    )
    expect(await m.negociosDeLosQueSalio("u-ana", AHORA)).toEqual(["Salón Demo"])
  })

  it("sin cuenta no se consulta nada (falla cerrado)", async () => {
    escenario([membresia("m-1", "b-1", "u-ana", haceDias(1))])
    const espia = vi.spyOn(base.prisma.businessMember, "findMany")
    expect(await m.negociosDeLosQueSalio("", AHORA)).toEqual([])
    expect(await m.negociosDeLosQueSalio(null, AHORA)).toEqual([])
    expect(await m.negociosDeLosQueSalio(undefined, AHORA)).toEqual([])
    expect(espia).not.toHaveBeenCalled()
  })
})
