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
const encargado: Actor = { rol: "admin", businessId: NEGOCIO, memberId: "m-encargado" }
const carla: Actor = { rol: "worker", businessId: NEGOCIO, memberId: "m-carla" }

const dePedro = { memberId: "m-pedro", professionalName: "Pedro Profesional" }

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar({
    ...datosBase(),
    visit: [
      atencion("v-propia"),
      atencion("v-ajena", { businessId: OTRO_NEGOCIO, customerId: "c-ajeno" }),
      atencion("v-con-colegas", { status: "por-cobrar" }),
      // Empezó y la volvieron a espera: conserva cuándo empezó.
      atencion("v-que-empezo", { startedAt: new Date("2026-10-06T14:00:00.000Z") }),
      // Lo de cada uno cabe en los topes; la atención entera, no.
      atencion("v-cara", { status: "en-atencion" }),
      atencion("v-larga", { status: "en-atencion" }),
    ],
    visitService: [
      linea("l-carla", "v-con-colegas"),
      linea("l-pedro", "v-con-colegas", { ...dePedro, priceCents: centavos(25000) }),
      linea("l-cara-carla", "v-cara"),
      linea("l-cara-pedro", "v-cara", { ...dePedro, priceCents: centavos(19_999_000) }),
      ...Array.from({ length: 20 }, (_, i) => linea(`l-larga-${String(i).padStart(2, "0")}`, "v-larga")),
      linea("l-larga-pedro", "v-larga", dePedro),
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

  it("con una condición de más, la toma sólo si también se cumple", async () => {
    const { tomarAtencion } = await import("./tablero")

    await tomarAtencion(tx, dueña, "v-propia", "en-espera", { notes: "tomada" }, { startedAt: null })
    expect(base.buscar("visit", { id: "v-propia" })[0].notes).toBe("tomada")

    await expect(
      tomarAtencion(tx, dueña, "v-que-empezo", "en-espera", { notes: "tomada" }, { startedAt: null })
    ).rejects.toMatchObject({ status: 409 })
    expect(base.buscar("visit", { id: "v-que-empezo" })[0].notes).toBeNull()
  })

  it("la condición no puede pisar el negocio: una atención ajena sigue sin matchear", async () => {
    const { tomarAtencion } = await import("./tablero")
    const antes = base.volcado()

    await expect(
      tomarAtencion(tx, dueña, "v-ajena", "en-espera", { status: "anulada" }, { businessId: OTRO_NEGOCIO })
    ).rejects.toMatchObject({ status: 409 })
    expect(base.volcado()).toEqual(antes)
  })
})

describe("lineasDeLaAtencion", () => {
  it("para los requisitos devuelve todas las líneas, también a la profesional, con los precios en unidades", async () => {
    const { lineasDeLaAtencion } = await import("./tablero")

    const { lineas } = await lineasDeLaAtencion(tx, carla, "v-con-colegas")

    expect(lineas).toEqual([
      { memberId: "m-carla", byOwner: false, price: 8000 },
      { memberId: "m-pedro", byOwner: false, price: 25000 },
    ])
  })

  it("el total, en centavos, es el de lo que ve el actor: la atención entera para la dueña, lo suyo para la profesional", async () => {
    const { lineasDeLaAtencion } = await import("./tablero")

    expect((await lineasDeLaAtencion(tx, dueña, "v-con-colegas")).totalCentavos).toBe(centavos(33000))
    expect((await lineasDeLaAtencion(tx, carla, "v-con-colegas")).totalCentavos).toBe(centavos(8000))
  })

  it("los topes, para la profesional, sobre sus líneas: no se entera de cuánto suman ni de cuántas son las de los demás", async () => {
    const { lineasDeLaAtencion } = await import("./tablero")

    await expect(lineasDeLaAtencion(tx, carla, "v-cara")).resolves.toMatchObject({ totalCentavos: centavos(8000) })
    await expect(lineasDeLaAtencion(tx, carla, "v-larga")).resolves.toMatchObject({ totalCentavos: centavos(8000) * 20 })
  })

  it("dueño y encargado, que la ven entera, la validan entera: 400 con el tope que se pasa", async () => {
    const { lineasDeLaAtencion } = await import("./tablero")

    for (const quien of [dueña, encargado]) {
      await expect(lineasDeLaAtencion(tx, quien, "v-cara")).rejects.toMatchObject({
        status: 400,
        message: "El total de la atención no puede pasar de $20.000.000: divídela en dos.",
      })
      await expect(lineasDeLaAtencion(tx, quien, "v-larga")).rejects.toMatchObject({
        status: 400,
        message: "Una atención puede tener hasta 20 servicios.",
      })
    }
  })

  it("las de otro negocio no cuentan", async () => {
    const { lineasDeLaAtencion } = await import("./tablero")
    const ajeno: Actor = { rol: "owner", businessId: OTRO_NEGOCIO, memberId: null }

    expect(await lineasDeLaAtencion(tx, ajeno, "v-con-colegas")).toEqual({ lineas: [], totalCentavos: 0 })
  })
})

describe("nombreEnElNegocio", () => {
  it("el nombre del dueño o de un miembro del negocio", async () => {
    const { nombreEnElNegocio } = await import("./tablero")

    expect(await nombreEnElNegocio(tx, dueña, "u-duena")).toBe("Ana Dueña")
    expect(await nombreEnElNegocio(tx, dueña, "u-encargado")).toBe("Bruno Encargado")
  })

  it("alguien de otro negocio, o ningún usuario, no se resuelve", async () => {
    const { nombreEnElNegocio } = await import("./tablero")

    // `u-ajeno` existe y se llama "Carla Profesional", pero es del otro negocio.
    expect(await nombreEnElNegocio(tx, dueña, "u-ajeno")).toBeNull()
    expect(await nombreEnElNegocio(tx, dueña, "u-otro")).toBeNull()
    expect(await nombreEnElNegocio(tx, dueña, null)).toBeNull()
  })
})
