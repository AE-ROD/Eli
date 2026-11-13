import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Prisma } from "@prisma/client"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase } from "@/pruebas/datos"
import { whereDeLiquidaciones, type Actor } from "@/lib/permisos"
import { ultimasLiquidacionesPorMiembro } from "./liquidacion"

/**
 * La última liquidación de cada miembro, en una sola consulta (la pantalla de
 * Liquidaciones). Contra la base falsa, que aplica `distinct` como Prisma:
 * la primera fila de cada miembro en el orden pedido.
 */

const base = crearBaseFalsa()
const db = base.prisma as unknown as Prisma.TransactionClient

const dueña: Actor = { rol: "owner", businessId: NEGOCIO, memberId: null }
const carla: Actor = { rol: "worker", businessId: NEGOCIO, memberId: "m-carla" }
const dueñoAjeno: Actor = { rol: "owner", businessId: OTRO_NEGOCIO, memberId: null }

function liquidacion(id: string, memberId: string, desde: string, hasta: string, datos: Record<string, unknown> = {}) {
  return {
    id,
    businessId: NEGOCIO,
    memberId,
    memberName: memberId,
    periodo: "quincenal",
    desde: new Date(desde),
    hasta: new Date(hasta),
    zona: "America/Santiago",
    comisionServiciosCents: 0,
    comisionProductosCents: 0,
    propinasCents: 0,
    adelantosCents: 0,
    ajustesCents: 0,
    brutoCents: 0,
    totalCents: 0,
    cerradaAt: new Date(`${hasta}T20:00:00.000Z`),
    cerradaPorId: "u-duena",
    cerradaPorNombre: "Ana Dueña",
    ...datos,
  }
}

const CON_HISTORIAL = [
  // Carla: tres períodos; la última es la de octubre.
  liquidacion("c-1", "m-carla", "2026-08-01", "2026-08-15"),
  liquidacion("c-3", "m-carla", "2026-10-01", "2026-10-15"),
  liquidacion("c-2", "m-carla", "2026-09-01", "2026-09-15"),
  // Pedro: la más reciente está anulada; cuenta la anterior.
  liquidacion("p-1", "m-pedro", "2026-09-01", "2026-09-15"),
  liquidacion("p-2", "m-pedro", "2026-10-01", "2026-10-15", { estado: "anulada", anuladaAt: new Date("2026-10-20T12:00:00.000Z") }),
  // El encargado: dos con el mismo `hasta` (una anulada y se volvió a cerrar con otro desde): gana la cerrada después.
  liquidacion("e-1", "m-encargado", "2026-10-01", "2026-10-15", { cerradaAt: new Date("2026-10-16T12:00:00.000Z") }),
  liquidacion("e-2", "m-encargado", "2026-10-05", "2026-10-15", { cerradaAt: new Date("2026-10-17T12:00:00.000Z") }),
  // Del otro negocio.
  liquidacion("a-1", "m-ajeno", "2026-10-01", "2026-10-15", { businessId: OTRO_NEGOCIO }),
]

const TODOS = ["m-encargado", "m-carla", "m-pedro"]

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar({ ...datosBase(), liquidacion: CON_HISTORIAL })
})

describe("ultimasLiquidacionesPorMiembro", () => {
  it("cada miembro recibe la suya: la de `hasta` más reciente, sin contar las anuladas", async () => {
    const ultimas = await ultimasLiquidacionesPorMiembro(db, dueña, TODOS)

    expect(ultimas.get("m-carla")).toEqual({ desde: "2026-10-01", hasta: "2026-10-15" })
    // La de octubre de Pedro está anulada: vale la de septiembre.
    expect(ultimas.get("m-pedro")).toEqual({ desde: "2026-09-01", hasta: "2026-09-15" })
  })

  it("con el mismo `hasta`, la que se cerró después", async () => {
    const ultimas = await ultimasLiquidacionesPorMiembro(db, dueña, TODOS)

    expect(ultimas.get("m-encargado")).toEqual({ desde: "2026-10-05", hasta: "2026-10-15" })
  })

  it("quien no tiene ninguna no está en el resultado", async () => {
    base.reiniciar({ ...datosBase(), liquidacion: CON_HISTORIAL.filter((fila) => fila.memberId !== "m-pedro") })

    const ultimas = await ultimasLiquidacionesPorMiembro(db, dueña, TODOS)

    expect([...ultimas.keys()].sort()).toEqual(["m-carla", "m-encargado"])
  })

  it("una sola consulta para todo el equipo, y ninguna si no hay a quién preguntar", async () => {
    await ultimasLiquidacionesPorMiembro(db, dueña, TODOS)

    expect(base.prisma.liquidacion.findMany).toHaveBeenCalledTimes(1)
    expect(base.prisma.liquidacion.findFirst).not.toHaveBeenCalled()

    expect(await ultimasLiquidacionesPorMiembro(db, dueña, [])).toEqual(new Map())
    expect(base.prisma.liquidacion.findMany).toHaveBeenCalledTimes(1)
  })

  it("da lo mismo que preguntarle a cada miembro por separado, como antes", async () => {
    const ultimas = await ultimasLiquidacionesPorMiembro(db, dueña, TODOS)

    for (const memberId of TODOS) {
      const antes = await db.liquidacion.findFirst({
        where: whereDeLiquidaciones(dueña, { memberId, estado: { not: "anulada" } }),
        select: { desde: true, hasta: true },
        orderBy: [{ hasta: "desc" }, { cerradaAt: "desc" }],
      })
      expect(antes).not.toBeNull()
      expect(ultimas.get(memberId)).toEqual({
        desde: antes!.desde.toISOString().slice(0, 10),
        hasta: antes!.hasta.toISOString().slice(0, 10),
      })
    }
  })

  it("aislamiento: el otro negocio no ve las de éste, ni éste las del otro", async () => {
    const ajeno = await ultimasLiquidacionesPorMiembro(db, dueñoAjeno, [...TODOS, "m-ajeno"])
    expect([...ajeno.keys()]).toEqual(["m-ajeno"])

    // Un miembro de otro negocio pedido por su id no aparece para esta dueña.
    const propio = await ultimasLiquidacionesPorMiembro(db, dueña, [...TODOS, "m-ajeno"])
    expect(propio.has("m-ajeno")).toBe(false)
    expect(propio.size).toBe(3)
  })

  it("permisos: la profesional sólo ve las suyas aunque pida las de todos", async () => {
    const ultimas = await ultimasLiquidacionesPorMiembro(db, carla, TODOS)

    expect([...ultimas.keys()]).toEqual(["m-carla"])
  })

  it("un profesional sin memberId no ve ninguna (falla cerrado)", async () => {
    const sinMiembro: Actor = { rol: "worker", businessId: NEGOCIO, memberId: null }

    expect((await ultimasLiquidacionesPorMiembro(db, sinMiembro, TODOS)).size).toBe(0)
  })
})
