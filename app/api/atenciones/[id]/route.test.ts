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
      // Alguien la marcó en progreso en la agenda; la atención nunca empezó.
      cita("cita-en-progreso-a-mano", "m-carla", "en-progreso"),
      cita("cita-recien-llegada", "m-carla", "confirmada"),
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
      atencion("v-que-volvio", { appointmentId: "cita-que-volvio", startedAt: new Date("2026-10-06T16:05:00.000Z") }),
      atencion("v-de-cita-en-progreso", { appointmentId: "cita-en-progreso-a-mano" }),
      atencion("v-recien-llegada", { appointmentId: "cita-recien-llegada" }),
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
      linea("l-de-cita-en-progreso", "v-de-cita-en-progreso"),
      linea("l-recien-llegada", "v-recien-llegada"),
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

describe("PUT /api/atenciones/[id]: topes", () => {
  /**
   * v-mixta tiene, además de lo de Carla, 25.000 de Pedro y 5.000 de la
   * dueña; v-de-cita-carla no tiene ninguna línea de nadie. Si el tope del
   * total se validara sobre la atención entera, el mismo pedido de Carla
   * pasaría en una y no en la otra: probando precios, el 400 le diría cuánto
   * suman las líneas que no ve. El de servicios, en cambio, sí se cuenta sobre
   * la atención entera: cuántos servicios hay no es dinero.
   */
  async function enLasDos(cuerpo: unknown) {
    const { PUT } = await import("./route")
    const respuesta = async (id: string) => {
      mockGetServerSession.mockResolvedValueOnce(sesiones.carla)
      const res = await PUT(pedido(URL, cuerpo), conId(id))
      const data = await res.json()
      // Lo que le llega: el error, o sus líneas (sin los ids, que son nuevos en cada atención), y si viaja un total.
      return {
        status: res.status,
        error: data.error ?? null,
        lineas:
          data.lineas?.map((l: { servicio: string; profesional: unknown; precio: number }) => [l.servicio, l.profesional, l.precio]) ??
          null,
        conTotal: "total" in data,
      }
    }
    return { conColegas: await respuesta("v-mixta"), sinColegas: await respuesta("v-de-cita-carla") }
  }

  it("la profesional no distingue cuánto suman las líneas ajenas: un precio que con ellas pasaría del tope, pasa igual", async () => {
    const { conColegas, sinColegas } = await enLasDos({ lineas: [{ servicioId: "s-color", precio: 20_000_000 }] })

    expect(conColegas).toEqual(sinColegas)
    expect(conColegas).toMatchObject({ status: 200, conTotal: false })
    // La atención entera quedó por encima del tope: así no se cobra (ver abajo).
    expect(lineasDe("v-mixta").reduce((suma, l) => suma + (l.priceCents as number), 0)).toBe(centavos(20_030_000))
  })

  it("lo suyo sí tiene tope: dos líneas que juntas pasan de 20.000.000 dan el mismo 400, con y sin colegas, y nada cambia", async () => {
    const antes = base.volcado()

    const { conColegas, sinColegas } = await enLasDos({
      lineas: [
        { servicioId: "s-color", precio: 19_999_999.99 },
        { servicioId: "s-corte", precio: 0.02 },
      ],
    })

    expect(conColegas).toEqual(sinColegas)
    expect(conColegas).toMatchObject({ status: 400, error: "El total de la atención no puede pasar de $20.000.000: divídela en dos." })
    expect(base.volcado()).toEqual(antes)
  })

  it("los servicios, en cambio, se cuentan con los de todos: 20 suyas caben solas, pero no junto a las de sus colegas", async () => {
    const antes = lineasDe("v-mixta")

    const { conColegas, sinColegas } = await enLasDos({ lineas: Array.from({ length: 20 }, () => ({ servicioId: "s-corte" })) })

    expect(sinColegas.status).toBe(200)
    expect(lineasDe("v-de-cita-carla")).toHaveLength(20)
    expect(conColegas).toMatchObject({ status: 400, error: "Una atención puede tener hasta 20 servicios." })
    expect(lineasDe("v-mixta")).toEqual(antes)
  })

  describe("la profesional no pasa de 20 servicios en total", () => {
    /** 19 servicios de Pedro y 1 de Carla: lo que reprodujo QA, con 20 justos. */
    function conDiecinueveDePedro() {
      const datos = escenario()
      base.reiniciar({
        ...datos,
        visit: [...datos.visit, atencion("v-llena", { status: "en-atencion" })],
        visitService: [
          ...datos.visitService,
          ...Array.from({ length: 19 }, (_, i) =>
            linea(`l-llena-pedro-${String(i).padStart(2, "0")}`, "v-llena", { memberId: "m-pedro", professionalName: "Pedro Profesional" })
          ),
          linea("l-llena-carla", "v-llena"),
        ],
      })
    }

    it("con 19 de un colega, 20 suyas dan 400 y la atención queda como estaba", async () => {
      conDiecinueveDePedro()
      const { PUT } = await import("./route")
      mockGetServerSession.mockResolvedValueOnce(sesiones.carla)
      const antes = base.volcado()

      const res = await PUT(pedido(URL, { lineas: Array.from({ length: 20 }, () => ({ servicioId: "s-corte" })) }), conId("v-llena"))

      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe("Una atención puede tener hasta 20 servicios.")
      expect(base.volcado()).toEqual(antes)
      expect(lineasDe("v-llena")).toHaveLength(20)
    })

    it("hasta 20 en total sí: reemplaza la suya por otra", async () => {
      conDiecinueveDePedro()
      const { PUT } = await import("./route")
      mockGetServerSession.mockResolvedValueOnce(sesiones.carla)

      const res = await PUT(pedido(URL, { lineas: [{ servicioId: "s-color" }] }), conId("v-llena"))

      expect(res.status).toBe(200)
      expect(lineasDe("v-llena")).toHaveLength(20)
      expect(lineasDe("v-llena").filter((l) => l.memberId === "m-carla")).toEqual([
        expect.objectContaining({ serviceName: "Color", priceCents: centavos(25000) }),
      ])
    })
  })

  it("y 21 suyas no pasan en ninguna: el pedido ya trae más de las que caben", async () => {
    const antes = base.volcado()

    const { conColegas, sinColegas } = await enLasDos({ lineas: Array.from({ length: 21 }, () => ({ servicioId: "s-corte" })) })

    expect(conColegas.status).toBe(400)
    expect(conColegas).toEqual(sinColegas)
    expect(base.volcado()).toEqual(antes)
  })

  it("la atención entera se sigue validando donde actúa el encargado, que la ve completa: no la pasa a cobro", async () => {
    await enLasDos({ lineas: [{ servicioId: "s-color", precio: 20_000_000 }] })
    const { POST } = await import("./estado/route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.encargado)

    const res = await POST(pedido(URL, { estado: "por-cobrar" }), conId("v-mixta"))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("El total de la atención no puede pasar de $20.000.000: divídela en dos.")
    expect(base.buscar("visit", { id: "v-mixta" })[0].status).toBe("en-atencion")
  })

  it("si edita la dueña, la atención entera: 400 si no cabe, aunque cada precio sea válido, y nada cambia", async () => {
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const antes = base.volcado()

    const res = await PUT(
      pedido(URL, {
        lineas: [
          { servicioId: "s-color", profesional: "m-carla", precio: 20_000_000 },
          { servicioId: "s-corte", profesional: "duenio", precio: 0.01 },
        ],
      }),
      conId("v-mixta")
    )

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

describe("PUT /api/atenciones/[id]: nunca borra líneas que quien edita no vio", () => {
  /**
   * 19 servicios de Pedro y 20 de Carla: 39, de antes de que el tope de
   * servicios se contara sobre la atención entera. El tablero lee con `take`
   * y muestra 20; el editor de la dueña guarda esos 20.
   */
  function conTreintaYNueve() {
    const datos = escenario()
    base.reiniciar({
      ...datos,
      visit: [...datos.visit, atencion("v-pasada", { status: "en-atencion" })],
      visitService: [
        ...datos.visitService,
        ...Array.from({ length: 19 }, (_, i) =>
          linea(`l-pasada-a-pedro-${String(i).padStart(2, "0")}`, "v-pasada", { memberId: "m-pedro", professionalName: "Pedro Profesional" })
        ),
        ...Array.from({ length: 20 }, (_, i) => linea(`l-pasada-b-carla-${String(i).padStart(2, "0")}`, "v-pasada")),
      ],
    })
  }

  /** Las líneas de la atención tal como le llegan a quien mira el tablero. */
  async function lineasQueVe(sesion: unknown, id: string) {
    const { GET } = await import("../route")
    mockGetServerSession.mockResolvedValueOnce(sesion)
    const tablero = await (
      await GET(pedido("http://localhost/api/atenciones?desde=2026-10-06T03:00:00.000Z&hasta=2026-10-07T03:00:00.000Z"))
    ).json()
    const atencionVista = tablero.atenciones.find((a: { id: string }) => a.id === id)
    return atencionVista.lineas as { servicioId: string; profesional: { id: string }; precio: number }[]
  }

  it.each([
    ["la dueña", sesiones.dueña],
    ["el encargado", sesiones.encargado],
  ])("%s guarda lo que ve: 409, y las líneas que no le llegaron siguen ahí", async (_quien, sesion) => {
    conTreintaYNueve()
    const vistas = await lineasQueVe(sesion, "v-pasada")
    expect(vistas).toHaveLength(20)
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesion)
    const antes = base.volcado()

    const res = await PUT(
      pedido(URL, {
        lineas: vistas.map((l) => ({ servicioId: l.servicioId, profesional: l.profesional.id, precio: l.precio })),
      }),
      conId("v-pasada")
    )

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe(
      "Esta atención tiene más de 20 servicios y no se ven todos: guardar borraría los que faltan. Anúlala y anótala de nuevo."
    )
    expect(base.volcado()).toEqual(antes)
    expect(lineasDe("v-pasada")).toHaveLength(39)
  })

  it("tampoco vaciándola: una lista vacía borraría las 39", async () => {
    conTreintaYNueve()
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const res = await PUT(pedido(URL, { lineas: [] }), conId("v-pasada"))

    expect(res.status).toBe(409)
    expect(lineasDe("v-pasada")).toHaveLength(39)
  })

  it("las notas sí se guardan: no tocan ninguna línea", async () => {
    conTreintaYNueve()
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const res = await PUT(pedido(URL, { notas: "revisar los servicios" }), conId("v-pasada"))

    expect(res.status).toBe(200)
    expect(lineasDe("v-pasada")).toHaveLength(39)
  })

  it("la profesional, que ve todas las suyas, sí la puede achicar hasta que entre", async () => {
    conTreintaYNueve()
    const { PUT } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.carla)

    const res = await PUT(pedido(URL, { lineas: [{ servicioId: "s-corte" }] }), conId("v-pasada"))

    expect(res.status).toBe(200)
    expect(lineasDe("v-pasada")).toHaveLength(20)
    expect(lineasDe("v-pasada").filter((l) => l.memberId === "m-pedro")).toHaveLength(19)
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

  async function mover(sesion: unknown, id: string, estado: string) {
    const { POST } = await import("./estado/route")
    mockGetServerSession.mockResolvedValueOnce(sesion)
    return (await POST(pedido(URL, { estado }), conId(id))).status
  }

  const citaGuardada = (id: string) => base.buscar("appointment", { id })[0]

  it("la dueña borra la atención en espera de una reserva, con sus líneas, y la cita vuelve a Reservas de hoy", async () => {
    const { status, data } = await deshacer(sesiones.dueña, "v-de-cita-en-progreso")

    expect(status).toBe(200)
    expect(data).toEqual({ eliminada: true })
    expect(base.buscar("visit", { id: "v-de-cita-en-progreso" })).toEqual([])
    expect(lineasDe("v-de-cita-en-progreso")).toEqual([])

    // La reserva aparece de nuevo en el tablero del día.
    const { GET } = await import("../route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const tablero = await (
      await GET(pedido("http://localhost/api/atenciones?desde=2026-10-06T03:00:00.000Z&hasta=2026-10-07T03:00:00.000Z"))
    ).json()
    expect(tablero.reservas.map((r: { id: string }) => r.id)).toContain("cita-en-progreso-a-mano")
  })

  it("una cita marcada en progreso en la agenda vuelve a confirmada: en Reservas de hoy no puede figurar atendiéndose", async () => {
    await deshacer(sesiones.dueña, "v-de-cita-en-progreso")

    expect(citaGuardada("cita-en-progreso-a-mano").status).toBe("confirmada")
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

  it("también si un colega ya tiene una línea en la atención: la reserva es suya", async () => {
    const { status } = await deshacer(sesiones.carla, "v-con-linea-de-pedro")

    expect(status).toBe(200)
    expect(base.buscar("visit", { id: "v-con-linea-de-pedro" })).toEqual([])
    expect(lineasDe("v-con-linea-de-pedro")).toEqual([])
  })

  it("el profesional con una línea en la atención de la cita de una colega la ve, pero no la deshace: 404 y no toca nada", async () => {
    const antes = base.volcado()

    const { status, data } = await deshacer(sesiones.pedro, "v-con-linea-de-pedro")

    expect(status).toBe(404)
    expect(data).toEqual({ error: "Atención no encontrada" })
    // Ni la atención, ni la línea de Pedro, ni la cita de Carla.
    expect(base.volcado()).toEqual(antes)
    expect(base.prisma.$transaction).not.toHaveBeenCalled()
  })

  it.each([
    ["una atención de otro negocio", sesiones.dueña, "v-ajena"],
    ["la de la cita de una colega, sin líneas suyas", sesiones.pedro, "v-de-cita-carla"],
    ["la de la cita de una colega, aunque tenga una línea suya", sesiones.pedro, "v-con-linea-de-pedro"],
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
    ["empezó y la volvieron a espera: eso se anula", "v-que-volvio"],
    ["ya está cobrada", "v-cobrada"],
    ["ya está anulada", "v-anulada"],
  ])("%s: 409 y no borra nada", async (_caso, id) => {
    const antes = base.volcado()

    const { status } = await deshacer(sesiones.dueña, id)

    expect(status).toBe(409)
    expect(base.volcado()).toEqual(antes)
  })

  it("empezar la atención y volverla a espera deja el rastro: ya no se deshace, se anula", async () => {
    expect(await mover(sesiones.dueña, "v-recien-llegada", "en-atencion")).toBe(200)
    expect(await mover(sesiones.dueña, "v-recien-llegada", "en-espera")).toBe(200)

    const { status, data } = await deshacer(sesiones.dueña, "v-recien-llegada")

    expect(status).toBe(409)
    expect(data.error).toBe("Sólo se deshace la llegada de una reserva que todavía no empezó a atenderse; lo demás se anula.")
    expect(base.buscar("visit", { id: "v-recien-llegada" })[0]).toMatchObject({ status: "en-espera", startedAt: expect.any(Date) })
    expect(lineasDe("v-recien-llegada")).toHaveLength(1)
    expect(citaGuardada("cita-recien-llegada").status).toBe("en-progreso")
  })

  it("si alguien la empieza mientras tanto, 409 y no se borra nada", async () => {
    const { DELETE } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const original = base.prisma.visit.findFirst.getMockImplementation()!
    base.prisma.visit.findFirst.mockImplementationOnce(async (args) => {
      const leida = await original(args)
      await base.prisma.visit.updateMany({ where: { id: "v-de-cita-en-progreso" }, data: { status: "en-atencion" } })
      return leida
    })

    const res = await DELETE(pedido(URL), conId("v-de-cita-en-progreso"))

    expect(res.status).toBe(409)
    expect(base.buscar("visit", { id: "v-de-cita-en-progreso" })).toHaveLength(1)
    expect(lineasDe("v-de-cita-en-progreso")).toHaveLength(1)
    expect(citaGuardada("cita-en-progreso-a-mano").status).toBe("en-progreso")
  })

  it("si alguien la empieza y la vuelve a espera mientras tanto, también 409: la toma exige que no haya empezado", async () => {
    const { DELETE } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const original = base.prisma.visit.findFirst.getMockImplementation()!
    base.prisma.visit.findFirst.mockImplementationOnce(async (args) => {
      const leida = await original(args)
      // Sigue en espera, pero ya empezó una vez.
      await base.prisma.visit.updateMany({ where: { id: "v-de-cita-en-progreso" }, data: { startedAt: new Date() } })
      return leida
    })

    const res = await DELETE(pedido(URL), conId("v-de-cita-en-progreso"))

    expect(res.status).toBe(409)
    expect(base.buscar("visit", { id: "v-de-cita-en-progreso" })).toHaveLength(1)
    expect(lineasDe("v-de-cita-en-progreso")).toHaveLength(1)
    expect(citaGuardada("cita-en-progreso-a-mano").status).toBe("en-progreso")
  })

  it("si la reserva se borra mientras tanto, 409 y no se borra nada: la toma exige que siga atada a la misma reserva", async () => {
    const { DELETE } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    // Se lee la reserva, y antes de tomar la atención alguien la borra de la
    // agenda: la base deja la atención sin reserva (ON DELETE SET NULL).
    const original = base.prisma.appointment.findFirst.getMockImplementation()!
    base.prisma.appointment.findFirst.mockImplementationOnce(async (args) => {
      const leida = await original(args)
      await base.prisma.visit.updateMany({ where: { id: "v-de-cita-carla" }, data: { appointmentId: null } })
      await base.prisma.appointment.deleteMany({ where: { id: "cita-carla" } })
      return leida
    })

    const res = await DELETE(pedido(URL), conId("v-de-cita-carla"))

    expect(res.status).toBe(409)
    // Sin reserva no hay adónde volver: eso ya no se deshace, se anula.
    expect(base.buscar("visit", { id: "v-de-cita-carla" })).toEqual([
      expect.objectContaining({ status: "en-espera", appointmentId: null }),
    ])
  })

  it("si la reserva deja de ser de la profesional mientras tanto, 404 y no se borra nada: se vuelve a mirar con la atención tomada", async () => {
    const { DELETE } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.carla)
    // Afuera de la transacción la reserva todavía es de Carla; cuando toma la
    // atención, ya es de Pedro.
    const original = base.prisma.appointment.findFirst.getMockImplementation()!
    base.prisma.appointment.findFirst.mockImplementationOnce(async (args) => {
      const leida = await original(args)
      await base.prisma.appointment.updateMany({ where: { id: "cita-carla" }, data: { memberId: "m-pedro" } })
      return leida
    })

    const res = await DELETE(pedido(URL), conId("v-de-cita-carla"))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "Atención no encontrada" })
    expect(base.buscar("visit", { id: "v-de-cita-carla" })).toHaveLength(1)
    expect(citaGuardada("cita-carla")).toMatchObject({ memberId: "m-pedro", status: "confirmada" })
  })

  it("sin sesión recibe 401 y no borra nada", async () => {
    const antes = base.volcado()

    const { status } = await deshacer(null, "v-de-cita-carla")

    expect(status).toBe(401)
    expect(base.volcado()).toEqual(antes)
  })
})
