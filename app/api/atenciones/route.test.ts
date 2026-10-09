import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { crearBaseFalsa } from "./_pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, atencion, centavos, datosBase, linea, pago, pedido, sesiones } from "./_pruebas/datos"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/** El día del tablero en Santiago (UTC-3 en octubre): [03:00Z, 03:00Z del día siguiente). */
const DESDE = "2026-10-06T03:00:00.000Z"
const HASTA = "2026-10-07T03:00:00.000Z"
const URL_DEL_DIA = `http://localhost/api/atenciones?desde=${DESDE}&hasta=${HASTA}`

const hoyA = (hora: string) => new Date(`2026-10-06T${hora}:00.000Z`)

function escenario() {
  return {
    ...datosBase(),
    appointment: [
      // Reserva de Carla para hoy, con servicio y precio: al llegar precarga su línea.
      { id: "cita-carla", businessId: NEGOCIO, customerId: "c-maria", memberId: "m-carla", serviceId: "s-corte", title: "Corte", price: 8000, status: "confirmada", startTime: hoyA("13:00"), endTime: hoyA("13:30") },
      { id: "cita-pedro", businessId: NEGOCIO, customerId: "c-beto", memberId: "m-pedro", serviceId: "s-color", title: "Color", price: 25000, status: "pendiente", startTime: hoyA("14:00"), endTime: hoyA("15:30") },
      // De la página pública: sin profesional elegido.
      { id: "cita-publica", businessId: NEGOCIO, customerId: "c-beto", serviceId: "s-color", title: "Color", price: 25000, status: "pendiente", startTime: hoyA("16:00"), endTime: hoyA("17:30") },
      { id: "cita-cancelada", businessId: NEGOCIO, customerId: "c-maria", memberId: "m-carla", title: "Corte", status: "cancelada", startTime: hoyA("17:00"), endTime: hoyA("17:30") },
      // Ya llegó: su atención está en el tablero, así que no es una reserva pendiente.
      { id: "cita-que-llego", businessId: NEGOCIO, customerId: "c-maria", memberId: "m-carla", title: "Corte", status: "en-progreso", startTime: hoyA("11:00"), endTime: hoyA("11:30") },
      { id: "cita-de-manana", businessId: NEGOCIO, customerId: "c-maria", memberId: "m-carla", title: "Corte", status: "confirmada", startTime: new Date("2026-10-07T13:00:00.000Z"), endTime: new Date("2026-10-07T13:30:00.000Z") },
      { id: "cita-ajena", businessId: OTRO_NEGOCIO, customerId: "c-ajeno", memberId: "m-ajeno", title: "Corte", status: "confirmada", startTime: hoyA("13:00"), endTime: hoyA("13:30") },
    ],
    visit: [
      atencion("v-de-cita", { status: "en-atencion", appointmentId: "cita-que-llego", startedAt: hoyA("11:05") }),
      atencion("v-pedro", { customerId: "c-beto", customerName: "Beto" }),
      atencion("v-mixta", { status: "por-cobrar" }),
      // Quedó abierta ayer: tiene que seguir en el tablero hasta que se cobre o se anule.
      atencion("v-de-ayer", { arrivedAt: new Date("2026-10-05T20:00:00.000Z") }),
      atencion("v-cobrada-hoy", { status: "finalizada", paidAt: hoyA("14:30"), totalCents: centavos(8000) }),
      atencion("v-cobrada-ayer", { status: "finalizada", paidAt: new Date("2026-10-05T20:00:00.000Z"), totalCents: centavos(8000) }),
      atencion("v-anulada", { status: "anulada", voidedAt: hoyA("12:00") }),
      atencion("v-ajena", { businessId: OTRO_NEGOCIO, customerId: "c-ajeno" }),
    ],
    visitService: [
      linea("l-de-cita", "v-de-cita"),
      linea("l-pedro", "v-pedro", { memberId: "m-pedro", professionalName: "Pedro Profesional", serviceId: "s-color", serviceName: "Color", priceCents: centavos(25000) }),
      linea("l-mixta-carla", "v-mixta"),
      linea("l-mixta-pedro", "v-mixta", { memberId: "m-pedro", professionalName: "Pedro Profesional", serviceId: "s-color", serviceName: "Color", priceCents: centavos(25000) }),
      linea("l-de-ayer", "v-de-ayer"),
      linea("l-cobrada-hoy", "v-cobrada-hoy"),
      linea("l-cobrada-ayer", "v-cobrada-ayer"),
      linea("l-anulada", "v-anulada"),
      linea("l-ajena", "v-ajena", { memberId: "m-ajeno", serviceId: "s-ajeno" }),
    ],
    visitPayment: [pago("p-cobrada-hoy", "v-cobrada-hoy", "efectivo", 8000)],
  }
}

const ids = (lista: { id: string }[]) => lista.map((item) => item.id).sort()

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(hoyA("15:00"))
  base.reiniciar(escenario())
})

afterEach(() => vi.useRealTimers())

describe("GET /api/atenciones", () => {
  it("sin sesión recibe 401 y no toca la base", async () => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await GET(pedido(URL_DEL_DIA))

    expect(res.status).toBe(401)
    expect(base.prisma.visit.findMany).not.toHaveBeenCalled()
  })

  it.each([
    ["sin rango", "http://localhost/api/atenciones"],
    ["con una fecha inválida", `http://localhost/api/atenciones?desde=ayer&hasta=${HASTA}`],
    ["sin zona en la fecha", `http://localhost/api/atenciones?desde=2026-10-06T03:00:00&hasta=${HASTA}`],
    ["con hasta antes que desde", `http://localhost/api/atenciones?desde=${HASTA}&hasta=${DESDE}`],
    ["con un rango de más de 48 horas", `http://localhost/api/atenciones?desde=${DESDE}&hasta=2026-10-08T03:00:01.000Z`],
  ])("%s responde 400 sin consultar", async (_caso, url) => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const res = await GET(pedido(url))

    expect(res.status).toBe(400)
    expect(base.prisma.visit.findMany).not.toHaveBeenCalled()
  })

  it("la dueña ve las reservas del día que no llegaron, en orden, con lo que necesita la tarjeta", async () => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const data = await (await GET(pedido(URL_DEL_DIA))).json()

    expect(data.reservas.map((r: { id: string }) => r.id)).toEqual(["cita-carla", "cita-pedro", "cita-publica"])
    expect(data.reservas[0]).toEqual({
      id: "cita-carla",
      inicio: "2026-10-06T13:00:00.000Z",
      fin: "2026-10-06T13:30:00.000Z",
      estado: "confirmada",
      titulo: "Corte",
      servicioId: "s-corte",
      precio: 8000,
      cliente: { id: "c-maria", nombre: "María González" },
      profesional: { id: "m-carla", nombre: "Carla Profesional" },
    })
    expect(data.reservas[2].profesional).toBeNull()
  })

  it("la dueña ve las activas de cualquier fecha y las cobradas hoy; ni anuladas, ni lo de ayer, ni lo ajeno", async () => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const data = await (await GET(pedido(URL_DEL_DIA))).json()

    expect(ids(data.atenciones)).toEqual(["v-cobrada-hoy", "v-de-ayer", "v-de-cita", "v-mixta", "v-pedro"])
  })

  it("la dueña recibe cada atención con todas sus líneas, sus pagos y su total", async () => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const data = await (await GET(pedido(URL_DEL_DIA))).json()
    const mixta = data.atenciones.find((a: { id: string }) => a.id === "v-mixta")
    const cobrada = data.atenciones.find((a: { id: string }) => a.id === "v-cobrada-hoy")

    expect(mixta.lineas).toHaveLength(2)
    // Abierta: el total es la suma viva de sus líneas.
    expect(mixta.total).toBe(33000)
    expect(mixta.pagos).toEqual([])
    expect(cobrada.total).toBe(8000)
    expect(cobrada.pagos).toEqual([{ id: "p-cobrada-hoy", medio: "efectivo", nombreMedio: "Efectivo", monto: 8000 }])
    expect(mixta.lineas[1]).toEqual({
      id: "l-mixta-pedro",
      servicioId: "s-color",
      servicio: "Color",
      profesional: { id: "m-pedro", nombre: "Pedro Profesional" },
      precio: 25000,
    })
  })

  it("el catálogo trae los servicios activos del negocio, a quién se le puede anotar y los medios de pago", async () => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.encargado)

    const { catalogo } = await (await GET(pedido(URL_DEL_DIA))).json()

    expect(catalogo.servicios).toEqual([
      { id: "s-color", nombre: "Color", precio: 25000 },
      { id: "s-corte", nombre: "Corte", precio: 8000 },
      { id: "s-peinado", nombre: "Peinado", precio: null },
    ])
    expect(catalogo.profesionales).toEqual([
      { id: "m-encargado", nombre: "Bruno Encargado" },
      { id: "m-carla", nombre: "Carla Profesional" },
      { id: "m-pedro", nombre: "Pedro Profesional" },
      { id: "duenio", nombre: "Ana Dueña" },
    ])
    expect(catalogo.mediosDePago.map((m: { id: string }) => m.id)).toEqual([
      "efectivo",
      "tarjeta-debito",
      "tarjeta-credito",
      "transferencia",
      "billetera-digital",
    ])
  })

  it("la profesional ve sus reservas y sus atenciones, no las de un colega", async () => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.carla)

    const data = await (await GET(pedido(URL_DEL_DIA))).json()

    expect(data.reservas.map((r: { id: string }) => r.id)).toEqual(["cita-carla"])
    // `v-pedro` es sólo de Pedro: no viaja. `v-mixta` sí, porque tiene una línea suya.
    expect(ids(data.atenciones)).toEqual(["v-cobrada-hoy", "v-de-ayer", "v-de-cita", "v-mixta"])
  })

  it("a la profesional le viajan sólo sus líneas, sin pagos ni total", async () => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.carla)

    const data = await (await GET(pedido(URL_DEL_DIA))).json()
    const mixta = data.atenciones.find((a: { id: string }) => a.id === "v-mixta")

    expect(mixta.lineas.map((l: { id: string }) => l.id)).toEqual(["l-mixta-carla"])
    for (const visible of data.atenciones) {
      expect(visible).not.toHaveProperty("total")
      expect(visible).not.toHaveProperty("pagos")
    }
    // Ni siquiera se le piden a la base: el filtro de pagos no matchea nada.
    expect(JSON.stringify(data)).not.toContain("p-cobrada-hoy")
  })

  it("la profesional ve la atención que nació de su cita aunque todavía no tenga líneas", async () => {
    const { GET } = await import("./route")
    base.reiniciar({
      ...escenario(),
      visit: [atencion("v-recien-llegada", { appointmentId: "cita-que-llego" })],
      visitService: [],
    })
    mockGetServerSession.mockResolvedValueOnce(sesiones.carla)

    const data = await (await GET(pedido(URL_DEL_DIA))).json()

    expect(ids(data.atenciones)).toEqual(["v-recien-llegada"])
  })

  it("en el catálogo, la profesional sólo puede anotarse a sí misma", async () => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.carla)

    const { catalogo } = await (await GET(pedido(URL_DEL_DIA))).json()

    expect(catalogo.profesionales).toEqual([{ id: "m-carla", nombre: "Carla Profesional" }])
  })

  it("Pedro no ve las atenciones de Carla, y de la mixta sólo su línea", async () => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.pedro)

    const data = await (await GET(pedido(URL_DEL_DIA))).json()
    const mixta = data.atenciones.find((a: { id: string }) => a.id === "v-mixta")

    expect(ids(data.atenciones)).toEqual(["v-mixta", "v-pedro"])
    expect(mixta.lineas.map((l: { id: string }) => l.id)).toEqual(["l-mixta-pedro"])
  })

  it("un profesional sin memberId no ve nada (falla cerrado)", async () => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.sinMiembro)

    const data = await (await GET(pedido(URL_DEL_DIA))).json()

    expect(data.reservas).toEqual([])
    expect(data.atenciones).toEqual([])
    expect(data.catalogo.profesionales).toEqual([])
  })

  it("el otro negocio ve sólo lo suyo: el aislamiento va en los dos sentidos", async () => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueñoAjeno)

    const data = await (await GET(pedido(URL_DEL_DIA))).json()

    expect(data.reservas.map((r: { id: string }) => r.id)).toEqual(["cita-ajena"])
    expect(ids(data.atenciones)).toEqual(["v-ajena"])
    expect(data.catalogo.servicios.map((s: { id: string }) => s.id)).toEqual(["s-ajeno"])
  })

  it("toda consulta de listado lleva tope", async () => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    await GET(pedido(URL_DEL_DIA))

    for (const delegado of [base.prisma.appointment, base.prisma.visit, base.prisma.service, base.prisma.businessMember]) {
      for (const [argumentos] of delegado.findMany.mock.calls) {
        expect(argumentos).toHaveProperty("take")
      }
    }
  })

  it("al profesional no se le pide el total a la base, ni siquiera para descartarlo", async () => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.carla)

    await GET(pedido(URL_DEL_DIA))

    expect(base.prisma.visit.findMany).toHaveBeenCalled()
    for (const [argumentos] of base.prisma.visit.findMany.mock.calls) {
      expect((argumentos as { select: { totalCents: boolean } }).select.totalCents).toBe(false)
    }
  })

  it("sin nada cortado, truncado es false", async () => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const data = await (await GET(pedido(URL_DEL_DIA))).json()

    expect(data.truncado).toBe(false)
  })

  it("muchas activas viejas no esconden las de hoy: van aparte, con su tope y de la más reciente a la más vieja", async () => {
    const { GET } = await import("./route")
    const viejas = Array.from({ length: 60 }, (_, i) =>
      atencion(`v-vieja-${String(i).padStart(2, "0")}`, { arrivedAt: new Date(Date.UTC(2026, 8, 1 + (i % 30), 12, i)) })
    )
    const deHoy = [atencion("v-hoy-1", { arrivedAt: hoyA("12:00") }), atencion("v-hoy-2", { arrivedAt: hoyA("14:00") })]
    base.reiniciar({ ...datosBase(), visit: [...viejas, ...deHoy] })
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const data = await (await GET(pedido(URL_DEL_DIA))).json()
    const recibidas = data.atenciones.map((a: { id: string }) => a.id)

    expect(recibidas).toEqual(expect.arrayContaining(["v-hoy-1", "v-hoy-2"]))
    expect(recibidas).toHaveLength(52)
    expect(data.truncado).toBe(true)
    // Las diez que quedan afuera son las más viejas.
    const masViejas = [...viejas]
      .sort((a, b) => (a.arrivedAt as Date).getTime() - (b.arrivedAt as Date).getTime())
      .slice(0, 10)
      .map((v) => v.id)
    for (const id of masViejas) expect(recibidas).not.toContain(id)
  })

  it("cada atención que nació de una cita trae la reserva, para precargar el editor", async () => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const data = await (await GET(pedido(URL_DEL_DIA))).json()
    const deCita = data.atenciones.find((a: { id: string }) => a.id === "v-de-cita")
    const sinReserva = data.atenciones.find((a: { id: string }) => a.id === "v-pedro")

    expect(deCita.reserva).toEqual({
      servicioId: null,
      titulo: "Corte",
      precio: null,
      profesional: { id: "m-carla", nombre: "Carla Profesional" },
    })
    expect(sinReserva.reserva).toBeNull()
  })

  it("un profesional con una línea en la atención de la cita de un colega no ve esa reserva", async () => {
    const { GET } = await import("./route")
    base.reiniciar({
      ...escenario(),
      visit: [atencion("v-de-cita", { status: "en-atencion", appointmentId: "cita-que-llego" })],
      visitService: [
        linea("l-de-carla", "v-de-cita"),
        linea("l-de-pedro", "v-de-cita", { memberId: "m-pedro", professionalName: "Pedro Profesional" }),
      ],
    })
    mockGetServerSession.mockResolvedValueOnce(sesiones.pedro)

    const data = await (await GET(pedido(URL_DEL_DIA))).json()

    expect(data.atenciones.map((a: { id: string }) => a.id)).toEqual(["v-de-cita"])
    expect(data.atenciones[0].reserva).toBeNull()
  })
})

describe("POST /api/atenciones con { citaId }: llegó una reserva", () => {
  it("crea la atención en espera, con el cliente copiado y la línea de la reserva precargada", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.encargado)

    const res = await POST(pedido("http://localhost/api/atenciones", { citaId: "cita-carla" }))
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data).toMatchObject({
      estado: "en-espera",
      citaId: "cita-carla",
      cliente: { id: "c-maria", nombre: "María González" },
      total: 8000,
      lineas: [{ servicioId: "s-corte", servicio: "Corte", profesional: { id: "m-carla", nombre: "Carla Profesional" }, precio: 8000 }],
      reserva: { servicioId: "s-corte", titulo: "Corte", precio: 8000, profesional: { id: "m-carla", nombre: "Carla Profesional" } },
    })
    const [creada] = base.buscar("visit", { appointmentId: "cita-carla" })
    expect(creada).toMatchObject({ businessId: NEGOCIO, createdById: "u-encargado", customerName: "María González" })
  })

  it("sin profesional en la cita no precarga nada: la línea la anota quien sepa quién la hace", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const data = await (await POST(pedido("http://localhost/api/atenciones", { citaId: "cita-publica" }))).json()

    expect(data.lineas).toEqual([])
  })

  it("la profesional registra la llegada de su propia reserva", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.carla)

    const res = await POST(pedido("http://localhost/api/atenciones", { citaId: "cita-carla" }))

    expect(res.status).toBe(201)
    expect((await res.json()).lineas).toHaveLength(1)
  })

  it.each([
    ["una cita de otro negocio", sesiones.dueña, "cita-ajena"],
    ["la cita de un colega, para la profesional", sesiones.carla, "cita-pedro"],
    ["una cita que no existe", sesiones.dueña, "cita-inventada"],
  ])("%s da 404 y no escribe nada", async (_caso, sesion, citaId) => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesion)
    const antes = base.volcado()

    const res = await POST(pedido("http://localhost/api/atenciones", { citaId }))

    expect(res.status).toBe(404)
    expect(base.volcado()).toEqual(antes)
  })

  it("una reserva que ya está en el tablero da 409", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const res = await POST(pedido("http://localhost/api/atenciones", { citaId: "cita-que-llego" }))

    expect(res.status).toBe(409)
    expect(base.buscar("visit", { appointmentId: "cita-que-llego" })).toHaveLength(1)
  })

  it("una reserva cancelada no llega: 409", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const res = await POST(pedido("http://localhost/api/atenciones", { citaId: "cita-cancelada" }))

    expect(res.status).toBe(409)
  })

  it("si dos marcan 'Llegó' a la vez, la segunda choca con el único y responde 409", async () => {
    const { POST } = await import("./route")
    // Simula la carrera: la cita se leyó sin atención, pero otra la creó antes.
    base.prisma.appointment.findFirst.mockImplementationOnce(async () => ({
      ...base.buscar("appointment", { id: "cita-que-llego" })[0],
      customer: { name: "María", lastName: "González" },
      service: null,
      member: { user: { name: "Carla Profesional" } },
      visit: null,
    }))
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const res = await POST(pedido("http://localhost/api/atenciones", { citaId: "cita-que-llego" }))

    expect(res.status).toBe(409)
    expect(base.buscar("visit", { appointmentId: "cita-que-llego" })).toHaveLength(1)
  })
})

describe("POST /api/atenciones con { citaId }: qué línea se precarga", () => {
  const URL = "http://localhost/api/atenciones"

  /** Una cita de hoy de la agenda: guarda el servicio como texto, sin `serviceId`. */
  const deLaAgenda = (id: string, datos: Record<string, unknown>) => ({
    id,
    businessId: NEGOCIO,
    customerId: "c-maria",
    status: "confirmada",
    startTime: hoyA("16:00"),
    endTime: hoyA("16:30"),
    ...datos,
  })

  async function llegar(sesion: unknown, cita: Record<string, unknown>, servicios?: Record<string, unknown>[]) {
    const { POST } = await import("./route")
    const datos = datosBase()
    base.reiniciar({ ...datos, service: servicios ?? datos.service, appointment: [cita] })
    mockGetServerSession.mockResolvedValueOnce(sesion)
    const res = await POST(pedido(URL, { citaId: cita.id }))
    return { status: res.status, data: await res.json() }
  }

  it("QA: una cita de la agenda, sin serviceId, precarga el servicio activo que se llama igual, sin mayúsculas ni espacios", async () => {
    const { status, data } = await llegar(sesiones.dueña, deLaAgenda("cita-agenda", { title: "  corte ", memberId: "m-carla" }))

    expect(status).toBe(201)
    // Sin precio en la cita, el del catálogo.
    expect(data.lineas).toEqual([
      expect.objectContaining({ servicioId: "s-corte", servicio: "Corte", profesional: { id: "m-carla", nombre: "Carla Profesional" }, precio: 8000 }),
    ])
    expect(base.buscar("visitService", { visitId: data.id })).toEqual([expect.objectContaining({ priceCents: centavos(8000) })])
  })

  it("con precio en la cita, ése, y la profesional que marca la llegada de su cita la recibe a su nombre", async () => {
    const { data } = await llegar(sesiones.carla, deLaAgenda("cita-agenda", { title: "Color", memberId: "m-carla", price: 20000 }))

    expect(data.lineas).toEqual([
      expect.objectContaining({ servicioId: "s-color", profesional: { id: "m-carla", nombre: "Carla Profesional" }, precio: 20000 }),
    ])
  })

  it("QA: la reserva pública trae el servicio pero no el profesional: la dueña no recibe línea y sí la reserva", async () => {
    const publica = deLaAgenda("cita-publica", { title: "Color", serviceId: "s-color", price: 25000 })

    const { data } = await llegar(sesiones.dueña, publica)

    expect(data.lineas).toEqual([])
    expect(data.reserva).toEqual({ servicioId: "s-color", titulo: "Color", precio: 25000, profesional: null })
  })

  it.each([
    ["un título que no es ningún servicio", { title: "Masaje descontracturante", memberId: "m-carla" }, undefined],
    ["un título que sólo coincide con un servicio inactivo", { title: "Alisado", memberId: "m-carla" }, undefined],
    [
      "dos servicios activos con ese nombre: no se adivina",
      { title: "Corte", memberId: "m-carla" },
      [
        { id: "s-corte", businessId: NEGOCIO, name: "Corte", price: 8000 },
        { id: "s-corte-nino", businessId: NEGOCIO, name: "corte", price: 6000 },
      ],
    ],
    ["un serviceId de un servicio que ya no se ofrece", { title: "Alisado", serviceId: "s-viejo", memberId: "m-carla" }, undefined],
    ["un servicio sin precio, ni en la cita ni en el catálogo", { title: "Peinado", memberId: "m-carla" }, undefined],
  ])("%s: llega sin línea, con la reserva para el editor", async (_caso, datos, servicios) => {
    const { status, data } = await llegar(sesiones.dueña, deLaAgenda("cita-agenda", datos), servicios)

    expect(status).toBe(201)
    expect(data.lineas).toEqual([])
    expect(data.reserva).toMatchObject({ titulo: datos.title, profesional: { id: "m-carla", nombre: "Carla Profesional" } })
  })
})

describe("POST /api/atenciones con { citaId }: sólo reservas de hoy", () => {
  const URL = "http://localhost/api/atenciones"
  /** Las 12:00 del 6 de octubre en Santiago (UTC-3); en Tokio (UTC+9) ya son las 00:00 del 7. */
  const AHORA = hoyA("15:00")
  const aHoras = (horas: number) => new Date(AHORA.getTime() + horas * 60 * 60 * 1000)
  const NO_ES_DE_HOY = "Esta reserva no es de hoy: sólo se marca la llegada de las reservas del día."

  async function llegarA(startTime: Date, extra: Record<string, unknown> = {}) {
    const { POST } = await import("./route")
    base.reiniciar({
      ...datosBase(),
      appointment: [
        { id: "cita", businessId: NEGOCIO, customerId: "c-maria", memberId: "m-carla", serviceId: "s-corte", title: "Corte", status: "confirmada", startTime, endTime: new Date(startTime.getTime() + 30 * 60_000) },
      ],
    })
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const res = await POST(pedido(URL, { citaId: "cita", ...extra }))
    return { status: res.status, data: await res.json() }
  }

  describe("con la zona de quien marca la llegada: el día calendario en esa zona", () => {
    const enSantiago = { zona: "America/Santiago" }

    it.each([
      ["QA: de ayer a las 20:00", "2026-10-05T23:00:00.000Z"],
      ["de ayer a las 23:59", "2026-10-06T02:59:00.000Z"],
      ["QA: de mañana a la 01:00, aunque esté a 13 horas", "2026-10-07T04:00:00.000Z"],
      ["de mañana a las 00:00 en punto", "2026-10-07T03:00:00.000Z"],
    ])("una reserva %s da 409 y no crea nada", async (_caso, inicio) => {
      const { status, data } = await llegarA(new Date(inicio), enSantiago)

      expect(status).toBe(409)
      expect(data.error).toBe(NO_ES_DE_HOY)
      expect(base.buscar("visit")).toEqual([])
    })

    it.each([
      ["a las 00:00 en punto", "2026-10-06T03:00:00.000Z"],
      ["atrasada, de la mañana", "2026-10-06T12:00:00.000Z"],
      ["a las 23:30", "2026-10-07T02:30:00.000Z"],
    ])("una reserva de hoy %s llega", async (_caso, inicio) => {
      const { status } = await llegarA(new Date(inicio), enSantiago)

      expect(status).toBe(201)
      expect(base.buscar("visit")).toHaveLength(1)
    })

    it("el día es el de esa zona: las 23:00 del 6 en Tokio ya son de ayer para alguien que está en Tokio", async () => {
      const inicio = new Date("2026-10-06T14:00:00.000Z")

      expect((await llegarA(inicio, enSantiago)).status).toBe(201)
      expect((await llegarA(inicio, { zona: "Asia/Tokyo" })).status).toBe(409)
    })

    it.each([
      ["un desplazamiento, que no es una zona", "-03:00"],
      ["una zona que no existe", "Marte/Olympus"],
      ["vacía", ""],
      ["que no es texto", -3],
    ])("una zona %s da 400 y no crea nada", async (_caso, zona) => {
      const { status } = await llegarA(hoyA("16:00"), { zona })

      expect(status).toBe(400)
      expect(base.buscar("visit")).toEqual([])
    })
  })

  describe("sin zona: a menos de 24 horas de ahora", () => {
    it.each([
      ["a más de 24 horas hacia adelante", 25],
      ["pasado mañana", 48],
      ["a más de 24 horas hacia atrás", -25],
    ])("una reserva %s da 409 con un mensaje claro, y no crea nada", async (_caso, horas) => {
      const { status, data } = await llegarA(aHoras(horas))

      expect(status).toBe(409)
      expect(data.error).toBe(NO_ES_DE_HOY)
      expect(base.buscar("visit")).toEqual([])
    })

    it.each([
      ["que todavía no empieza", 23],
      ["atrasada", -23],
    ])("una reserva de hoy %s llega", async (_caso, horas) => {
      const { status } = await llegarA(aHoras(horas))

      expect(status).toBe(201)
    })
  })
})

describe("POST /api/atenciones sin reserva", () => {
  const URL = "http://localhost/api/atenciones"

  it("con un cliente nuevo: lo crea en el negocio y anota las líneas con los nombres de la base", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const res = await POST(
      pedido(URL, {
        clienteNuevo: { nombre: "Daniela Ruiz", telefono: "+56 9 5555 5555" },
        lineas: [
          { servicioId: "s-corte", profesional: "m-pedro", precio: 7500, servicio: "Hackeado", nombreProfesional: "Otro" },
          { servicioId: "s-color", profesional: "duenio" },
        ],
        notas: "Primera vez",
      })
    )
    const data = await res.json()

    expect(res.status).toBe(201)
    const [cliente] = base.buscar("customer", { name: "Daniela Ruiz" })
    expect(cliente).toMatchObject({ businessId: NEGOCIO, phone: "+56 9 5555 5555" })
    expect(data).toMatchObject({ estado: "en-espera", cliente: { id: cliente.id, nombre: "Daniela Ruiz" }, notas: "Primera vez" })
    // En la base, en centavos.
    expect(base.buscar("visitService", { visitId: data.id })).toEqual([
      expect.objectContaining({ serviceName: "Corte", memberId: "m-pedro", byOwner: false, professionalName: "Pedro Profesional", priceCents: centavos(7500) }),
      // Sin precio en el cuerpo, el del catálogo. La dueña va con `byOwner` y sin memberId.
      expect.objectContaining({ serviceName: "Color", memberId: null, byOwner: true, professionalName: "Ana Dueña", priceCents: centavos(25000) }),
    ])
    // Por la API, en unidades.
    expect(data.lineas.map((l: { precio: number }) => l.precio)).toEqual([7500, 25000])
  })

  it("con un cliente existente del negocio", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.encargado)

    const res = await POST(pedido(URL, { clienteId: "c-beto" }))

    expect(res.status).toBe(201)
    expect((await res.json()).cliente).toEqual({ id: "c-beto", nombre: "Beto" })
  })

  it("un cliente de otro negocio da 404 y no escribe nada", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const antes = base.volcado()

    const res = await POST(pedido(URL, { clienteId: "c-ajeno" }))

    expect(res.status).toBe(404)
    expect(base.volcado()).toEqual(antes)
  })

  it("un servicio de otro negocio da 404 y deshace todo, también el cliente nuevo", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const antes = base.volcado()

    const res = await POST(
      pedido(URL, { clienteNuevo: { nombre: "Daniela Ruiz" }, lineas: [{ servicioId: "s-ajeno", profesional: "m-carla" }] })
    )

    expect(res.status).toBe(404)
    expect(base.volcado()).toEqual(antes)
  })

  it("un profesional de otro negocio da 404", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const res = await POST(pedido(URL, { clienteId: "c-maria", lineas: [{ servicioId: "s-corte", profesional: "m-ajeno" }] }))

    expect(res.status).toBe(404)
  })

  it("la profesional anota a alguien y la línea queda a su nombre aunque pida otro", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.carla)

    const res = await POST(pedido(URL, { clienteId: "c-beto", lineas: [{ servicioId: "s-corte", profesional: "m-pedro" }] }))
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(base.buscar("visitService", { visitId: data.id })).toEqual([
      expect.objectContaining({ memberId: "m-carla", byOwner: false, professionalName: "Carla Profesional" }),
    ])
    // Y la ve: es suya.
    expect(data.lineas).toHaveLength(1)
    expect(data).not.toHaveProperty("total")
  })

  it("la profesional no puede anotar una línea a nombre de la dueña", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.carla)

    const data = await (await POST(pedido(URL, { clienteId: "c-beto", lineas: [{ servicioId: "s-corte", profesional: "duenio" }] }))).json()

    expect(base.buscar("visitService", { visitId: data.id })).toEqual([
      expect.objectContaining({ memberId: "m-carla", byOwner: false }),
    ])
  })

  it("la profesional sin líneas recibe 400: nunca podría ver una atención vacía", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.carla)
    const antes = base.volcado()

    const res = await POST(pedido(URL, { clienteNuevo: { nombre: "Daniela Ruiz" } }))

    expect(res.status).toBe(400)
    expect(base.volcado()).toEqual(antes)
  })

  it("un profesional sin memberId no puede anotar a nadie (falla cerrado)", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.sinMiembro)

    const res = await POST(pedido(URL, { clienteId: "c-beto", lineas: [{ servicioId: "s-corte" }] }))

    expect(res.status).toBe(401)
  })

  it("dueña o encargado: toda línea necesita a alguien que la haga", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const res = await POST(pedido(URL, { clienteId: "c-beto", lineas: [{ servicioId: "s-corte" }] }))

    expect(res.status).toBe(400)
  })

  it("una línea nueva con un servicio que ya no se ofrece da 400 y no crea nada", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const antes = base.volcado()

    const res = await POST(pedido(URL, { clienteNuevo: { nombre: "Daniela Ruiz" }, lineas: [{ servicioId: "s-viejo", profesional: "m-carla" }] }))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("«Alisado» ya no se ofrece: elige otro servicio.")
    expect(base.volcado()).toEqual(antes)
  })

  it("si el total no cabe, 400 y no crea nada, aunque cada precio sea válido", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const antes = base.volcado()

    const res = await POST(
      pedido(URL, {
        clienteNuevo: { nombre: "Daniela Ruiz" },
        lineas: [
          { servicioId: "s-color", profesional: "m-carla", precio: 20_000_000 },
          { servicioId: "s-corte", profesional: "m-pedro", precio: 0.01 },
        ],
      })
    )

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/no puede pasar de \$20\.000\.000/)
    expect(base.volcado()).toEqual(antes)
  })

  it("un servicio sin precio en el catálogo pide el precio en vez de inventar un cero", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const sinPrecio = await POST(pedido(URL, { clienteId: "c-beto", lineas: [{ servicioId: "s-peinado", profesional: "m-carla" }] }))
    const conPrecio = await POST(
      pedido(URL, { clienteId: "c-beto", lineas: [{ servicioId: "s-peinado", profesional: "m-carla", precio: 12000 }] })
    )

    expect(sinPrecio.status).toBe(400)
    expect(conPrecio.status).toBe(201)
  })

  it.each([
    ["sin cliente", { lineas: [] }],
    ["con cliente existente y nuevo a la vez", { clienteId: "c-beto", clienteNuevo: { nombre: "Daniela" } }],
    ["con un precio negativo", { clienteId: "c-beto", lineas: [{ servicioId: "s-corte", profesional: "m-carla", precio: -1 }] }],
    ["con un precio de tres decimales", { clienteId: "c-beto", lineas: [{ servicioId: "s-corte", profesional: "m-carla", precio: 10.005 }] }],
    ["con un precio por encima del tope", { clienteId: "c-beto", lineas: [{ servicioId: "s-corte", profesional: "m-carla", precio: 20_000_000.01 }] }],
    ["con más de 20 líneas", { clienteId: "c-beto", lineas: Array.from({ length: 21 }, () => ({ servicioId: "s-corte", profesional: "m-carla" })) }],
    ["sin cuerpo", undefined],
  ])("%s responde 400", async (_caso, cuerpo) => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const res = await POST(pedido(URL, cuerpo))

    expect(res.status).toBe(400)
  })

  it("sin sesión recibe 401 y no crea nada", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(null)
    const antes = base.volcado()

    const res = await POST(pedido(URL, { clienteId: "c-beto" }))

    expect(res.status).toBe(401)
    expect(base.volcado()).toEqual(antes)
  })
})
