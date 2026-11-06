import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase, pedido, sesiones } from "@/pruebas/datos"

/**
 * "Nueva cita" con servicios del catálogo (#159): como la reserva pública,
 * llenan título, precio y las filas de `cita_servicios`, leídos del catálogo
 * del negocio en el servidor. El texto libre sigue para una cita sin
 * servicio. `GET /api/citas/servicios` es el catálogo que ve el modal.
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const aLas = (hora: string) => new Date(`2099-10-20T${hora}:00.000Z`).toISOString()

beforeEach(() => {
  vi.clearAllMocks()
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    service: [
      { id: "s-corte", businessId: NEGOCIO, name: "Corte", duration: 30, price: 8000 },
      { id: "s-color", businessId: NEGOCIO, name: "Color", duration: 60, price: 25000 },
      { id: "s-viejo", businessId: NEGOCIO, name: "Alisado", duration: 90, price: 30000, active: false },
      { id: "s-ajeno", businessId: OTRO_NEGOCIO, name: "Corte", duration: 30, price: 9000 },
    ],
    // Pedro sólo hace cortes; Carla no tiene filas: hace todos.
    memberService: [
      { id: "ms-1", businessId: NEGOCIO, memberId: "m-pedro", serviceId: "s-corte" },
      { id: "ms-ajeno", businessId: OTRO_NEGOCIO, memberId: "m-ajeno", serviceId: "s-ajeno" },
    ],
  })
})

async function crear(cuerpo: Record<string, unknown>, sesion: unknown = sesiones.dueña) {
  const { POST } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const respuesta = await POST(
    pedido("http://localhost/api/citas", {
      customerId: "c-maria",
      startTime: aLas("10:00"),
      endTime: aLas("11:30"),
      confirmarAdvertencias: true,
      ...cuerpo,
    })
  )
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const filasDe = (id: string) =>
  base
    .buscar("appointmentService", { appointmentId: id })
    .sort((a, b) => (a.orden as number) - (b.orden as number))
    .map(({ businessId, serviceId, serviceName, duration, price, orden }) => ({ businessId, serviceId, serviceName, duration, price, orden }))

describe("POST /api/citas con servicios del catálogo (#159)", () => {
  it("llena título, servicio, precio y una fila por servicio, como la reserva pública", async () => {
    const { status, cuerpo } = await crear({ servicioIds: ["s-corte", "s-color"], memberId: "m-carla", title: "Lo que sea" })

    expect(status).toBe(201)
    expect(base.buscar("appointment", { id: cuerpo.id })[0]).toMatchObject({
      title: "Corte + Color",
      serviceId: "s-corte",
      price: 33000,
      businessId: NEGOCIO,
    })
    expect(filasDe(cuerpo.id)).toEqual([
      { businessId: NEGOCIO, serviceId: "s-corte", serviceName: "Corte", duration: 30, price: 8000, orden: 1 },
      { businessId: NEGOCIO, serviceId: "s-color", serviceName: "Color", duration: 60, price: 25000, orden: 2 },
    ])
  })

  it("un precio escrito a mano manda sobre la suma; las filas guardan el del catálogo", async () => {
    const { cuerpo } = await crear({ servicioIds: ["s-corte"], endTime: aLas("10:30"), price: 7000 })

    expect(base.buscar("appointment", { id: cuerpo.id })[0].price).toBe(7000)
    expect(filasDe(cuerpo.id)[0].price).toBe(8000)
  })

  it("si se alargó la hora de fin, las filas se reparten para sumar lo que dura la cita", async () => {
    const { cuerpo } = await crear({ servicioIds: ["s-corte", "s-color"], endTime: aLas("12:00") })

    expect(filasDe(cuerpo.id).map((fila) => fila.duration)).toEqual([40, 80])
  })

  it.each([
    ["de otro negocio", ["s-ajeno"]],
    ["inactivo", ["s-viejo"]],
    ["que no existe", ["s-nada"]],
    ["uno bueno y uno ajeno", ["s-corte", "s-ajeno"]],
  ])("un servicio %s: 404 y no se crea nada", async (_caso, servicioIds) => {
    const antes = base.volcado()
    const { status } = await crear({ servicioIds })

    expect(status).toBe(404)
    expect(base.volcado()).toEqual(antes)
  })

  it("un profesional que no hace todos los servicios: 400 y no se crea", async () => {
    const antes = base.volcado()
    const { status, cuerpo } = await crear({ servicioIds: ["s-corte", "s-color"], memberId: "m-pedro" })

    expect(status).toBe(400)
    expect(cuerpo.error).toMatch(/no hace/)
    expect(base.volcado()).toEqual(antes)
  })

  it("el que sí los hace: se crea", async () => {
    expect((await crear({ servicioIds: ["s-corte"], memberId: "m-pedro", endTime: aLas("10:30") })).status).toBe(201)
  })

  it("el profesional agenda para sí: se mira lo que hace él, no lo que pidió", async () => {
    const { status } = await crear({ servicioIds: ["s-color"], memberId: "m-carla", endTime: aLas("11:00") }, sesiones.pedro)
    expect(status).toBe(400)
  })

  it("una duración que no cabe en los servicios: 400", async () => {
    const { status } = await crear({ servicioIds: ["s-corte", "s-color"], endTime: new Date(Date.parse(aLas("10:00")) + 60_000).toISOString() })
    expect(status).toBe(400)
  })

  it("repetidos o más de cuatro: 400", async () => {
    expect((await crear({ servicioIds: ["s-corte", "s-corte"] })).status).toBe(400)
    expect((await crear({ servicioIds: ["a", "b", "c", "d", "e"] })).status).toBe(400)
  })

  it("texto libre, sin servicios: como siempre, sin filas", async () => {
    const { status, cuerpo } = await crear({ title: "Consulta" })

    expect(status).toBe(201)
    expect(base.buscar("appointment", { id: cuerpo.id })[0]).toMatchObject({ title: "Consulta", serviceId: null, price: null })
    expect(filasDe(cuerpo.id)).toEqual([])
  })

  it("sin título ni servicios: 400", async () => {
    expect((await crear({})).status).toBe(400)
  })
})

describe("GET /api/citas/servicios", () => {
  async function catalogo(sesion: unknown) {
    const { GET } = await import("./servicios/route")
    mockGetServerSession.mockResolvedValueOnce(sesion)
    const respuesta = await GET()
    return { status: respuesta.status, cuerpo: await respuesta.json() }
  }

  it("los activos del negocio y qué hace cada profesional acotado; nada de otro negocio", async () => {
    const { status, cuerpo } = await catalogo(sesiones.dueña)

    expect(status).toBe(200)
    expect(cuerpo.servicios.map((servicio: { id: string }) => servicio.id)).toEqual(["s-corte", "s-color"])
    expect(cuerpo.serviciosPorProfesional).toEqual({ "m-pedro": ["s-corte"] })
  })

  it("el profesional sólo ve lo suyo", async () => {
    expect((await catalogo(sesiones.carla)).cuerpo.serviciosPorProfesional).toEqual({})
    expect((await catalogo(sesiones.pedro)).cuerpo.serviciosPorProfesional).toEqual({ "m-pedro": ["s-corte"] })
  })

  it("el dueño de otro negocio ve sólo lo suyo", async () => {
    const { cuerpo } = await catalogo(sesiones.dueñoAjeno)
    expect(cuerpo.servicios.map((servicio: { id: string }) => servicio.id)).toEqual(["s-ajeno"])
    expect(cuerpo.serviciosPorProfesional).toEqual({ "m-ajeno": ["s-ajeno"] })
  })

  it("sin sesión: 401", async () => {
    expect((await catalogo(null)).status).toBe(401)
  })
})
