import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "../_pruebas/base-falsa"
import {
  NEGOCIO,
  OTRO_NEGOCIO,
  atencion,
  centavos,
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

/** El día de los escenarios; las citas son de hoy a las 13:00 de Santiago. */
const HOY = new Date("2026-10-06T16:00:00.000Z")

const cita = (id: string, memberId: string, status: string) => ({
  id,
  businessId: NEGOCIO,
  customerId: "c-maria",
  memberId,
  title: "Corte",
  status,
  startTime: new Date("2026-10-06T16:00:00.000Z"),
  endTime: new Date("2026-10-06T16:30:00.000Z"),
})

function escenario() {
  return {
    ...datosBase(),
    appointment: [
      cita("cita-carla", "m-carla", "confirmada"),
      // Empezó (la cita pasó a en progreso) y la volvieron a espera.
      cita("cita-que-volvio", "m-carla", "en-progreso"),
      cita("cita-cancelada-a-mano", "m-carla", "cancelada"),
      cita("cita-empezada", "m-carla", "en-progreso"),
      cita("cita-de-carla-atendida-por-pedro", "m-carla", "confirmada"),
      { ...cita("cita-ajena", "m-ajeno", "confirmada"), businessId: OTRO_NEGOCIO, customerId: "c-ajeno" },
    ],
    visit: [
      atencion("v-mixta", { status: "en-atencion" }),
      atencion("v-pedro"),
      // Nació de una cita de Carla y nadie le anotó nada todavía.
      atencion("v-de-cita-carla", { appointmentId: "cita-carla" }),
      atencion("v-que-volvio", { appointmentId: "cita-que-volvio" }),
      atencion("v-de-cita-cancelada", { appointmentId: "cita-cancelada-a-mano" }),
      atencion("v-empezada", { status: "en-atencion", appointmentId: "cita-empezada" }),
      atencion("v-con-linea-de-pedro", { appointmentId: "cita-de-carla-atendida-por-pedro" }),
      atencion("v-cobrada", { status: "finalizada", paidAt: new Date(), totalCents: centavos(8000) }),
      atencion("v-anulada", { status: "anulada", voidedAt: new Date() }),
      atencion("v-ajena", { businessId: OTRO_NEGOCIO, customerId: "c-ajeno", appointmentId: "cita-ajena" }),
    ],
    visitService: [
      linea("l-carla", "v-mixta"),
      linea("l-pedro", "v-mixta", { memberId: "m-pedro", professionalName: "Pedro Profesional", serviceId: "s-color", serviceName: "Color", priceCents: centavos(25000) }),
      lineaDeLaDueña("l-duena", "v-mixta", { priceCents: centavos(5000) }),
      linea("l-solo-pedro", "v-pedro", { memberId: "m-pedro", professionalName: "Pedro Profesional" }),
      linea("l-que-volvio", "v-que-volvio"),
      linea("l-empezada", "v-empezada"),
      linea("l-de-pedro-en-cita-de-carla", "v-con-linea-de-pedro", { memberId: "m-pedro", professionalName: "Pedro Profesional" }),
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
    // En la base, en centavos; por la API, en unidades.
    expect(lineasDe("v-mixta")).toEqual([
      expect.objectContaining({ serviceName: "Color", memberId: "m-carla", byOwner: false, professionalName: "Carla Profesional", priceCents: centavos(20000) }),
      expect.objectContaining({ serviceName: "Corte", memberId: null, byOwner: true, professionalName: "Ana Dueña", priceCents: centavos(8000) }),
    ])
    expect(data.total).toBe(28000)
    expect(data.lineas.map((l: { precio: number }) => l.precio)).toEqual([20000, 8000])
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

describe("PUT /api/atenciones/[id]: servicios que ya no se ofrecen", () => {
  /** v-mixta con una línea de Alisado, que el negocio desactivó después de anotarla. */
  function conAlisado() {
    const datos = escenario()
    base.reiniciar({
      ...datos,
      visitService: [
        ...datos.visitService,
        linea("l-alisado", "v-mixta", { serviceId: "s-viejo", serviceName: "Alisado", priceCents: centavos(30000) }),
      ],
    })
  }

  it("una línea nueva con un servicio inactivo da 400 y no cambia nada", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const antes = base.volcado()

    const res = await PUT(pedido(URL, { lineas: [{ servicioId: "s-viejo", profesional: "m-carla" }] }), conId("v-pedro"))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("«Alisado» ya no se ofrece: elige otro servicio.")
    expect(base.volcado()).toEqual(antes)
  })

  it("la línea que ya estaba con ese servicio se conserva al guardar, aunque cambie de precio o de profesional", async () => {
    conAlisado()
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.encargado)

    const res = await PUT(
      pedido(URL, {
        lineas: [
          { servicioId: "s-corte", profesional: "m-carla" },
          { servicioId: "s-viejo", profesional: "m-pedro", precio: 28000 },
        ],
      }),
      conId("v-mixta")
    )

    expect(res.status).toBe(200)
    expect(lineasDe("v-mixta").find((l) => l.serviceId === "s-viejo")).toMatchObject({ memberId: "m-pedro", priceCents: centavos(28000) })
  })

  it("pero no se duplica: dos líneas de un servicio inactivo donde había una es una nueva, 400", async () => {
    conAlisado()
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const antes = base.volcado()

    const res = await PUT(
      pedido(URL, {
        lineas: [
          { servicioId: "s-viejo", profesional: "m-carla" },
          { servicioId: "s-viejo", profesional: "m-pedro" },
        ],
      }),
      conId("v-mixta")
    )

    expect(res.status).toBe(400)
    expect(base.volcado()).toEqual(antes)
  })

  it("la profesional conserva sólo lo que reemplaza: una línea inactiva de un colega no le habilita el servicio", async () => {
    const datos = escenario()
    base.reiniciar({
      ...datos,
      visitService: [
        ...datos.visitService,
        linea("l-alisado-de-pedro", "v-mixta", { memberId: "m-pedro", professionalName: "Pedro Profesional", serviceId: "s-viejo", serviceName: "Alisado" }),
      ],
    })
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.carla)

    const res = await PUT(pedido(URL, { lineas: [{ servicioId: "s-viejo" }] }), conId("v-mixta"))

    expect(res.status).toBe(400)
  })
})

describe("PUT /api/atenciones/[id]: topes de la atención entera", () => {
  it("la profesional no pasa del tope de servicios sumando los de sus colegas: 400 y nada cambia", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.carla)
    const antes = base.volcado()

    // v-mixta tiene una de Pedro y una de la dueña: 19 suyas harían 21.
    const res = await PUT(pedido(URL, { lineas: Array.from({ length: 19 }, () => ({ servicioId: "s-corte" })) }), conId("v-mixta"))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("Una atención puede tener hasta 20 servicios.")
    expect(base.volcado()).toEqual(antes)
  })

  it("justo en el tope, sí", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.carla)

    const res = await PUT(pedido(URL, { lineas: Array.from({ length: 18 }, () => ({ servicioId: "s-corte" })) }), conId("v-mixta"))

    expect(res.status).toBe(200)
    expect(lineasDe("v-mixta")).toHaveLength(20)
  })

  it("si el total de la atención entera no cabe, 400 y nada cambia, aunque cada precio sea válido", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.carla)
    const antes = base.volcado()

    // 20.000.000 de Carla más los 30.000 de Pedro y la dueña.
    const res = await PUT(pedido(URL, { lineas: [{ servicioId: "s-color", precio: 20_000_000 }] }), conId("v-mixta"))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/no puede pasar de \$20\.000\.000/)
    expect(base.volcado()).toEqual(antes)
  })

  it("un total justo en el tope se guarda, con los centavos exactos", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const res = await PUT(
      pedido(URL, {
        lineas: [
          { servicioId: "s-color", profesional: "m-carla", precio: 19_999_999.99 },
          { servicioId: "s-corte", profesional: "duenio", precio: 0.01 },
        ],
      }),
      conId("v-mixta")
    )

    expect(res.status).toBe(200)
    expect((await res.json()).total).toBe(20_000_000)
    expect(lineasDe("v-mixta").map((l) => l.priceCents)).toEqual([1_999_999_999, 1])
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
    expect(lineas.find((l) => l.memberId === "m-carla")).toMatchObject({ serviceName: "Color", priceCents: centavos(22000) })
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
      expect.objectContaining({ id: "l-pedro", priceCents: centavos(25000) }),
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
    expect(lineasDe("v-de-cita-carla")).toEqual([expect.objectContaining({ memberId: "m-carla", priceCents: centavos(8000) })])
  })

  it("un profesional sin memberId no llega a ninguna atención", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.sinMiembro)

    const res = await PUT(pedido(URL, { notas: "x" }), conId("v-de-cita-carla"))

    expect(res.status).toBe(404)
  })
})

describe("DELETE /api/atenciones/[id]: deshacer una llegada", () => {
  async function deshacer(sesion: unknown, id: string) {
    const { DELETE } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesion)
    const res = await DELETE(pedido(URL), conId(id))
    return { status: res.status, data: await res.json() }
  }

  const citaGuardada = (id: string) => base.buscar("appointment", { id })[0]

  it("la dueña borra la atención en espera de una reserva, con sus líneas, y la cita vuelve a Reservas de hoy", async () => {
    const { status, data } = await deshacer(sesiones.dueña, "v-que-volvio")

    expect(status).toBe(200)
    expect(data).toEqual({ eliminada: true })
    expect(base.buscar("visit", { id: "v-que-volvio" })).toEqual([])
    expect(lineasDe("v-que-volvio")).toEqual([])

    // La reserva aparece de nuevo en el tablero del día.
    const { GET } = await import("../route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const tablero = await (
      await GET(pedido("http://localhost/api/atenciones?desde=2026-10-06T03:00:00.000Z&hasta=2026-10-07T03:00:00.000Z"))
    ).json()
    expect(tablero.reservas.map((r: { id: string }) => r.id)).toContain("cita-que-volvio")
  })

  it("la cita que había quedado en progreso vuelve a confirmada: en Reservas de hoy no puede figurar atendiéndose", async () => {
    await deshacer(sesiones.dueña, "v-que-volvio")

    expect(citaGuardada("cita-que-volvio").status).toBe("confirmada")
  })

  it("una cita confirmada queda confirmada", async () => {
    await deshacer(sesiones.encargado, "v-de-cita-carla")

    expect(citaGuardada("cita-carla").status).toBe("confirmada")
  })

  it("una cita cancelada a mano en la agenda no se pisa", async () => {
    const { status } = await deshacer(sesiones.dueña, "v-de-cita-cancelada")

    expect(status).toBe(200)
    expect(citaGuardada("cita-cancelada-a-mano").status).toBe("cancelada")
  })

  it("la profesional deshace la llegada de su propia cita", async () => {
    const { status } = await deshacer(sesiones.carla, "v-de-cita-carla")

    expect(status).toBe(200)
    expect(base.buscar("visit", { id: "v-de-cita-carla" })).toEqual([])
  })

  it("y el profesional con una línea en la atención, aunque la cita sea de una colega", async () => {
    const { status } = await deshacer(sesiones.pedro, "v-con-linea-de-pedro")

    expect(status).toBe(200)
  })

  it.each([
    ["una atención de otro negocio", sesiones.dueña, "v-ajena"],
    ["la de la cita de una colega, sin líneas suyas", sesiones.pedro, "v-de-cita-carla"],
    ["una que no existe", sesiones.dueña, "v-inventada"],
    ["cualquiera, para un profesional sin memberId", sesiones.sinMiembro, "v-de-cita-carla"],
  ])("%s: 404 y no borra nada", async (_caso, sesion, id) => {
    const antes = base.volcado()

    const { status, data } = await deshacer(sesion, id)

    expect(status).toBe(404)
    expect(data).toEqual({ error: "Atención no encontrada" })
    expect(base.volcado()).toEqual(antes)
  })

  it.each([
    ["sin reserva: eso se anula", "v-pedro"],
    ["ya empezó", "v-empezada"],
    ["ya está cobrada", "v-cobrada"],
    ["ya está anulada", "v-anulada"],
  ])("%s: 409 y no borra nada", async (_caso, id) => {
    const antes = base.volcado()

    const { status } = await deshacer(sesiones.dueña, id)

    expect(status).toBe(409)
    expect(base.volcado()).toEqual(antes)
  })

  it("si alguien la empieza mientras tanto, 409 y no se borra nada", async () => {
    const { DELETE } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const original = base.prisma.visit.findFirst.getMockImplementation()!
    base.prisma.visit.findFirst.mockImplementationOnce(async (args) => {
      const leida = await original(args)
      await base.prisma.visit.updateMany({ where: { id: "v-que-volvio" }, data: { status: "en-atencion" } })
      return leida
    })

    const res = await DELETE(pedido(URL), conId("v-que-volvio"))

    expect(res.status).toBe(409)
    expect(base.buscar("visit", { id: "v-que-volvio" })).toHaveLength(1)
    expect(lineasDe("v-que-volvio")).toHaveLength(1)
    expect(citaGuardada("cita-que-volvio").status).toBe("en-progreso")
  })

  it("sin sesión recibe 401 y no borra nada", async () => {
    const antes = base.volcado()

    const { status } = await deshacer(null, "v-de-cita-carla")

    expect(status).toBe(401)
    expect(base.volcado()).toEqual(antes)
  })
})
