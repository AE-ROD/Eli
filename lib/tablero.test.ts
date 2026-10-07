import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Prisma } from "@prisma/client"
import { crearBaseFalsa } from "@/app/api/atenciones/_pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, atencion, centavos, datosBase, linea } from "@/app/api/atenciones/_pruebas/datos"
import type { Actor } from "@/lib/permisos"

/**
 * Las escrituras compartidas del tablero, contra la base falsa. Cada endpoint
 * llega a `tomarAtencion` con un id que ya verificó; estos tests miran que la
 * escritura no dependa de eso.
 */

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/** La base falsa hace de cliente de una transacción: es el mismo objeto sin `$transaction`. */
const tx = base.prisma as unknown as Prisma.TransactionClient

const dueña: Actor = { rol: "owner", businessId: NEGOCIO, memberId: null }
const carla: Actor = { rol: "worker", businessId: NEGOCIO, memberId: "m-carla" }

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar({
    ...datosBase(),
    visit: [
      atencion("v-propia"),
      atencion("v-ajena", { businessId: OTRO_NEGOCIO, customerId: "c-ajeno" }),
      atencion("v-con-colegas", { status: "por-cobrar" }),
    ],
    visitService: [
      linea("l-carla", "v-con-colegas"),
      linea("l-pedro", "v-con-colegas", { memberId: "m-pedro", professionalName: "Pedro Profesional", priceCents: centavos(25000) }),
    ],
  })
})

describe("tomarAtencion", () => {
  it("toma la atención del negocio del actor si sigue en el estado esperado", async () => {
    const { tomarAtencion } = await import("./tablero")

    await tomarAtencion(tx, dueña, "v-propia", "en-espera", { status: "en-atencion" })

    expect(base.buscar("visit", { id: "v-propia" })[0].status).toBe("en-atencion")
  })

  it("una atención de otro negocio no matchea aunque el id y el estado coincidan: 409 y no la toca", async () => {
    const { tomarAtencion } = await import("./tablero")
    const antes = base.volcado()

    await expect(tomarAtencion(tx, dueña, "v-ajena", "en-espera", { status: "anulada" })).rejects.toMatchObject({
      status: 409,
    })
    expect(base.volcado()).toEqual(antes)
  })

  it("si cambió de estado entretanto, 409 y no la pisa", async () => {
    const { tomarAtencion } = await import("./tablero")

    await expect(tomarAtencion(tx, dueña, "v-propia", "por-cobrar", { status: "finalizada" })).rejects.toMatchObject({
      status: 409,
    })
    expect(base.buscar("visit", { id: "v-propia" })[0].status).toBe("en-espera")
  })
})

describe("lineasDeLaAtencion", () => {
  it("mira todas las líneas, no sólo las del actor, y devuelve el total en centavos con los precios en unidades", async () => {
    const { lineasDeLaAtencion } = await import("./tablero")

    const { lineas, totalCentavos } = await lineasDeLaAtencion(tx, carla, "v-con-colegas")

    expect(totalCentavos).toBe(centavos(33000))
    expect(lineas).toEqual([
      { memberId: "m-carla", byOwner: false, price: 8000 },
      { memberId: "m-pedro", byOwner: false, price: 25000 },
    ])
  })

  it("las de otro negocio no cuentan", async () => {
    const { lineasDeLaAtencion } = await import("./tablero")
    const ajeno: Actor = { rol: "owner", businessId: OTRO_NEGOCIO, memberId: null }

    expect(await lineasDeLaAtencion(tx, ajeno, "v-con-colegas")).toEqual({ lineas: [], totalCentavos: 0 })
  })
})
