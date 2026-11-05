import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, conId, datosBase, pedido, sesiones } from "@/pruebas/datos"

/**
 * Las filas de `cita_servicios` siguen a la cita cuando se edita en el panel
 * (#138): si cambia lo que dura, sus duraciones se reparten para sumar lo
 * nuevo (sin tocar los precios); un título a mano no se acepta en una cita
 * de servicios del catálogo.
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const aLas = (hora: string) => new Date(`2099-10-20T${hora}:00.000Z`)

const cita = (id: string, datos: Record<string, unknown> = {}) => ({
  id,
  businessId: NEGOCIO,
  customerId: "c-maria",
  memberId: "m-carla",
  title: "Corte + Color",
  status: "confirmada",
  startTime: aLas("10:00"),
  endTime: aLas("11:30"),
  ...datos,
})

const fila = (appointmentId: string, orden: number, serviceName: string, duration: number, price: number, businessId = NEGOCIO) => ({
  id: `${appointmentId}-${orden}`,
  appointmentId,
  businessId,
  serviceId: null,
  serviceName,
  duration,
  price,
  orden,
})

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar({
    ...datosBase(),
    appointment: [
      cita("con-filas"),
      cita("sin-filas", { title: "Corte" }),
      { ...cita("ajena"), businessId: OTRO_NEGOCIO, customerId: "c-ajeno", memberId: "m-ajeno" },
    ],
    appointmentService: [
      fila("con-filas", 1, "Corte", 30, 8000),
      fila("con-filas", 2, "Color", 60, 25000),
      fila("ajena", 1, "Corte", 30, 8000, OTRO_NEGOCIO),
      fila("ajena", 2, "Color", 60, 25000, OTRO_NEGOCIO),
    ],
  })
})

async function editar(id: string, cuerpo: Record<string, unknown>, sesion: unknown = sesiones.dueña) {
  const { PUT } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const respuesta = await PUT(pedido(`http://localhost/api/citas/${id}`, { confirmarAdvertencias: true, ...cuerpo }), conId(id))
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const filasDe = (id: string) =>
  base
    .buscar("appointmentService", { appointmentId: id })
    .sort((a, b) => (a.orden as number) - (b.orden as number))
    .map(({ serviceName, duration, price }) => ({ serviceName, duration, price }))

describe("PUT /api/citas/[id]: las filas de servicios siguen a la cita (#138)", () => {
  it("alargarla reparte la duración nueva entre las filas, sin tocar los precios", async () => {
    const { status } = await editar("con-filas", { startTime: aLas("10:00").toISOString(), endTime: aLas("12:00").toISOString() })

    expect(status).toBe(200)
    expect(filasDe("con-filas")).toEqual([
      { serviceName: "Corte", duration: 40, price: 8000 },
      { serviceName: "Color", duration: 80, price: 25000 },
    ])
  })

  it("acortarla también: las filas suman lo que dura la cita", async () => {
    expect((await editar("con-filas", { endTime: aLas("11:00").toISOString() })).status).toBe(200)
    expect(filasDe("con-filas").map((f) => f.duration)).toEqual([20, 40])
  })

  it("moverla sin cambiar lo que dura no toca las filas", async () => {
    const antes = filasDe("con-filas")
    const { status } = await editar("con-filas", { startTime: aLas("14:00").toISOString(), endTime: aLas("15:30").toISOString() })

    expect(status).toBe(200)
    expect(filasDe("con-filas")).toEqual(antes)
  })

  it("una duración que no cabe en las filas (menos de un minuto por servicio): 400 y nada cambia", async () => {
    const antes = base.volcado()
    const { status, cuerpo } = await editar("con-filas", { endTime: new Date(aLas("10:00").getTime() + 60_000).toISOString() })

    expect(status).toBe(400)
    expect(cuerpo.error).toMatch(/2 servicios/)
    expect(base.volcado()).toEqual(antes)
  })

  it("un título a mano en una cita de servicios del catálogo: 409 y nada cambia", async () => {
    const antes = base.volcado()
    const { status, cuerpo } = await editar("con-filas", { title: "Otra cosa" })

    expect(status).toBe(409)
    expect(cuerpo.error).toMatch(/catálogo/)
    expect(base.volcado()).toEqual(antes)
  })

  it("mandar el mismo título no es un cambio", async () => {
    expect((await editar("con-filas", { title: "Corte + Color" })).status).toBe(200)
  })

  it("una cita sin filas (texto libre) sigue cambiando de título y de hora como siempre", async () => {
    expect((await editar("sin-filas", { title: "Corte y barba", endTime: aLas("12:00").toISOString() })).status).toBe(200)
    expect(base.buscar("appointment", { id: "sin-filas" })[0]).toMatchObject({ title: "Corte y barba", endTime: aLas("12:00") })
  })

  it("una cita de otro negocio: 404 y sus filas no cambian", async () => {
    const antes = base.volcado()
    expect((await editar("ajena", { endTime: aLas("12:00").toISOString() })).status).toBe(404)
    expect(base.volcado()).toEqual(antes)
  })
})

describe("PUT /api/citas/[id]: reasignar una cita con servicios (#159)", () => {
  beforeEach(() => {
    base.reiniciar({
      ...datosBase(),
      appointment: [cita("con-filas"), cita("borrado", { title: "Alisado" })],
      appointmentService: [
        { ...fila("con-filas", 1, "Corte", 30, 8000), serviceId: "s-corte" },
        { ...fila("con-filas", 2, "Color", 60, 25000), serviceId: "s-color" },
        // Un servicio que se borró del catálogo: ya no hay contra qué comparar.
        fila("borrado", 1, "Alisado", 90, 30000),
      ],
      // Pedro sólo hace cortes; Carla no tiene filas: hace todo.
      memberService: [{ id: "ms-1", businessId: NEGOCIO, memberId: "m-pedro", serviceId: "s-corte" }],
    })
  })

  it("a un profesional que no hace todos sus servicios: 400, como al crearla, y nada cambia", async () => {
    const antes = base.volcado()
    const { status, cuerpo } = await editar("con-filas", { memberId: "m-pedro" })

    expect(status).toBe(400)
    expect(cuerpo.error).toMatch(/no hace todos los servicios/)
    expect(base.volcado()).toEqual(antes)
  })

  it("a quien los hace todos, sí", async () => {
    base.reiniciar({
      ...base.volcado(),
      memberService: [
        { id: "ms-1", businessId: NEGOCIO, memberId: "m-pedro", serviceId: "s-corte" },
        { id: "ms-2", businessId: NEGOCIO, memberId: "m-pedro", serviceId: "s-color" },
      ],
    })
    expect((await editar("con-filas", { memberId: "m-pedro" })).status).toBe(200)
    expect(base.buscar("appointment", { id: "con-filas" })[0].memberId).toBe("m-pedro")
  })

  it("las filas de un servicio borrado del catálogo no frenan la reasignación", async () => {
    expect((await editar("borrado", { memberId: "m-pedro" })).status).toBe(200)
  })
})

describe("PUT /api/citas/[id]: la cita y sus filas cambian juntas al cancelar", () => {
  it("si ajustar las filas falla, la cita tampoco queda cancelada", async () => {
    const antes = base.volcado()
    base.prisma.appointmentService.updateMany.mockRejectedValueOnce(new Error("se cayó la conexión"))

    const { status } = await editar("con-filas", { status: "cancelada", endTime: aLas("12:00").toISOString() })

    expect(status).toBe(500)
    expect(base.volcado()).toEqual(antes)
  })
})
