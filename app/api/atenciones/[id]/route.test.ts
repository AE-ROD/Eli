import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "../_pruebas/base-falsa"
import {
  NEGOCIO,
  OTRO_NEGOCIO,
  atencion,
  conId,
  datosBase,
  linea,
  lineaDeLaDueña,
  pedido,
  sesiones,
} from "../_pruebas/datos"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const URL = "http://localhost/api/atenciones/x"

function escenario() {
  return {
    ...datosBase(),
    appointment: [
      { id: "cita-carla", businessId: NEGOCIO, customerId: "c-maria", memberId: "m-carla", title: "Corte", status: "confirmada", startTime: new Date(), endTime: new Date() },
    ],
    visit: [
      atencion("v-mixta", { status: "en-atencion" }),
      atencion("v-pedro"),
      // Nació de una cita de Carla y nadie le anotó nada todavía.
      atencion("v-de-cita-carla", { appointmentId: "cita-carla" }),
      atencion("v-cobrada", { status: "finalizada", paidAt: new Date(), total: 8000 }),
      atencion("v-anulada", { status: "anulada", voidedAt: new Date() }),
      atencion("v-ajena", { businessId: OTRO_NEGOCIO, customerId: "c-ajeno" }),
    ],
    visitService: [
      linea("l-carla", "v-mixta"),
      linea("l-pedro", "v-mixta", { memberId: "m-pedro", professionalName: "Pedro Profesional", serviceId: "s-color", serviceName: "Color", price: 25000 }),
      lineaDeLaDueña("l-duena", "v-mixta", { price: 5000 }),
      linea("l-solo-pedro", "v-pedro", { memberId: "m-pedro", professionalName: "Pedro Profesional" }),
      linea("l-cobrada", "v-cobrada"),
      linea("l-ajena", "v-ajena", { memberId: "m-ajeno", serviceId: "s-ajeno" }),
    ],
  }
}

const lineasDe = (visitId: string) => base.buscar("visitService", { visitId })

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar(escenario())
})

describe("PUT /api/atenciones/[id]: aislamiento", () => {
  it("una atención de otro negocio da 404 y no escribe nada", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const antes = base.volcado()

    const res = await PUT(pedido(URL, { lineas: [], notas: "hackeada" }), conId("v-ajena"))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "Atención no encontrada" })
    expect(base.volcado()).toEqual(antes)
    expect(base.prisma.$transaction).not.toHaveBeenCalled()
  })

  it("una atención de otro negocio responde igual que una que no existe", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const ajena = await PUT(pedido(URL, { notas: "x" }), conId("v-ajena"))
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const inexistente = await PUT(pedido(URL, { notas: "x" }), conId("v-que-no-existe"))

    expect(ajena.status).toBe(inexistente.status)
    expect(await ajena.json()).toEqual(await inexistente.json())
  })

  it("la profesional no llega a la atención de un colega: 404, no 403", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.carla)
    const antes = base.volcado()

    const res = await PUT(pedido(URL, { lineas: [{ servicioId: "s-corte" }] }), conId("v-pedro"))

    expect(res.status).toBe(404)
    expect(base.volcado()).toEqual(antes)
  })

  it("sin sesión recibe 401", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await PUT(pedido(URL, { notas: "x" }), conId("v-mixta"))

    expect(res.status).toBe(401)
  })
})

describe("PUT /api/atenciones/[id]: dueña y encargado", () => {
  it("reemplazan todas las líneas, con los nombres de la base y no los del cuerpo", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.encargado)

    const res = await PUT(
      pedido(URL, {
        lineas: [
          { servicioId: "s-color", profesional: "m-carla", precio: 20000, servicio: "Gratis", professionalName: "Nadie" },
          { servicioId: "s-corte", profesional: "duenio" },
        ],
      }),
      conId("v-mixta")
    )
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(lineasDe("v-mixta")).toEqual([
      expect.objectContaining({ serviceName: "Color", memberId: "m-carla", byOwner: false, professionalName: "Carla Profesional", price: 20000 }),
      expect.objectContaining({ serviceName: "Corte", memberId: null, byOwner: true, professionalName: "Ana Dueña", price: 8000 }),
    ])
    expect(data.total).toBe(28000)
    expect(data.lineas.map((l: { profesional: { id: string } }) => l.profesional.id)).toEqual(["m-carla", "duenio"])
  })

  it("un servicio de otro negocio da 404 y no cambia ninguna línea", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const antes = base.volcado()

    const res = await PUT(pedido(URL, { lineas: [{ servicioId: "s-ajeno", profesional: "m-carla" }] }), conId("v-mixta"))

    expect(res.status).toBe(404)
    expect(base.volcado()).toEqual(antes)
  })

  it("un miembro de otro negocio da 404 y no cambia ninguna línea", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const antes = base.volcado()

    const res = await PUT(pedido(URL, { lineas: [{ servicioId: "s-corte", profesional: "m-ajeno" }] }), conId("v-mixta"))

    expect(res.status).toBe(404)
    expect(base.volcado()).toEqual(antes)
  })

  it("editan sólo las notas sin tocar las líneas", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const lineasAntes = lineasDe("v-mixta")

    const res = await PUT(pedido(URL, { notas: "Quiere el flequillo más corto" }), conId("v-mixta"))

    expect(res.status).toBe(200)
    expect(base.buscar("visit", { id: "v-mixta" })[0].notes).toBe("Quiere el flequillo más corto")
    expect(lineasDe("v-mixta")).toEqual(lineasAntes)
  })

  it("lo cobrado no se reescribe: una atención finalizada da 409 y no cambia", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const antes = base.volcado()

    const res = await PUT(pedido(URL, { lineas: [], notas: "corregida" }), conId("v-cobrada"))

    expect(res.status).toBe(409)
    expect(base.volcado()).toEqual(antes)
  })

  it("una atención anulada tampoco se edita: 409", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const res = await PUT(pedido(URL, { notas: "x" }), conId("v-anulada"))

    expect(res.status).toBe(409)
  })

  it("si la cobran mientras se edita, la edición no pasa: 409", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    // La lee abierta, y antes de escribir alguien la cobra.
    const original = base.prisma.visit.findFirst.getMockImplementation()!
    base.prisma.visit.findFirst.mockImplementationOnce(async (args) => {
      const leida = await original(args)
      await base.prisma.visit.updateMany({ where: { id: "v-mixta" }, data: { status: "finalizada" } })
      return leida
    })

    const res = await PUT(pedido(URL, { lineas: [] }), conId("v-mixta"))

    expect(res.status).toBe(409)
    expect(lineasDe("v-mixta")).toHaveLength(3)
  })

  it.each([
    ["un cuerpo vacío", {}],
    ["una línea sin servicio", { lineas: [{ profesional: "m-carla" }] }],
    ["un precio negativo", { lineas: [{ servicioId: "s-corte", profesional: "m-carla", precio: -5 }] }],
  ])("%s responde 400", async (_caso, cuerpo) => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const res = await PUT(pedido(URL, cuerpo), conId("v-mixta"))

    expect(res.status).toBe(400)
  })
})

describe("PUT /api/atenciones/[id]: la profesional", () => {
  it("reemplaza sólo sus líneas: las del colega y las de la dueña quedan intactas", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.carla)

    const res = await PUT(pedido(URL, { lineas: [{ servicioId: "s-color", precio: 22000 }] }), conId("v-mixta"))

    expect(res.status).toBe(200)
    const lineas = lineasDe("v-mixta")
    expect(lineas.map((l) => l.id)).toEqual(expect.arrayContaining(["l-pedro", "l-duena"]))
    expect(lineas.find((l) => l.id === "l-carla")).toBeUndefined()
    expect(lineas.find((l) => l.memberId === "m-carla")).toMatchObject({ serviceName: "Color", price: 22000 })
    expect(lineas).toHaveLength(3)
  })

  it("lo que anota queda a su nombre aunque mande el memberId de otro", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.carla)

    await PUT(pedido(URL, { lineas: [{ servicioId: "s-corte", profesional: "m-pedro" }] }), conId("v-mixta"))

    const nuevas = lineasDe("v-mixta").filter((l) => !["l-pedro", "l-duena"].includes(l.id as string))
    expect(nuevas).toEqual([expect.objectContaining({ memberId: "m-carla", byOwner: false, professionalName: "Carla Profesional" })])
    // La línea de Pedro sigue siendo la de antes.
    expect(lineasDe("v-mixta").filter((l) => l.memberId === "m-pedro")).toEqual([
      expect.objectContaining({ id: "l-pedro", price: 25000 }),
    ])
  })

  it("no puede marcar una línea como de la dueña", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.carla)

    await PUT(pedido(URL, { lineas: [{ servicioId: "s-corte", profesional: "duenio" }] }), conId("v-mixta"))

    const deLaDueña = lineasDe("v-mixta").filter((l) => l.byOwner)
    expect(deLaDueña.map((l) => l.id)).toEqual(["l-duena"])
  })

  it("no edita líneas ajenas: mandar una lista vacía sólo borra las suyas", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.pedro)

    await PUT(pedido(URL, { lineas: [] }), conId("v-mixta"))

    expect(lineasDe("v-mixta").map((l) => l.id).sort()).toEqual(["l-carla", "l-duena"])
  })

  it("en la respuesta ve sólo sus líneas, sin total ni pagos", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.carla)

    const data = await (await PUT(pedido(URL, { notas: "lista" }), conId("v-mixta"))).json()

    expect(data.lineas.map((l: { id: string }) => l.id)).toEqual(["l-carla"])
    expect(data).not.toHaveProperty("total")
    expect(data).not.toHaveProperty("pagos")
  })

  it("le anota su servicio a la atención que nació de su cita", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.carla)

    const res = await PUT(pedido(URL, { lineas: [{ servicioId: "s-corte" }] }), conId("v-de-cita-carla"))

    expect(res.status).toBe(200)
    expect(lineasDe("v-de-cita-carla")).toEqual([expect.objectContaining({ memberId: "m-carla", price: 8000 })])
  })

  it("un profesional sin memberId no llega a ninguna atención", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.sinMiembro)

    const res = await PUT(pedido(URL, { notas: "x" }), conId("v-de-cita-carla"))

    expect(res.status).toBe(404)
  })
})
