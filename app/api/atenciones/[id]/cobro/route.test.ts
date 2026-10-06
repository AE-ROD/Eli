import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { crearBaseFalsa } from "../../_pruebas/base-falsa"
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
} from "../../_pruebas/datos"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const URL = "http://localhost/api/atenciones/x/cobro"
const AHORA = new Date("2026-10-06T15:00:00.000Z")

function escenario() {
  return {
    ...datosBase(),
    appointment: [
      {
        id: "cita-de-la-mixta",
        businessId: NEGOCIO,
        customerId: "c-maria",
        memberId: "m-carla",
        title: "Corte",
        price: 8000,
        status: "en-progreso",
        startTime: new Date("2026-10-06T13:00:00.000Z"),
        endTime: new Date("2026-10-06T13:30:00.000Z"),
      },
    ],
    visit: [
      // Corte de Carla (8.000) + Color de la dueña (25.000) = 33.000.
      atencion("v-mixta", { status: "por-cobrar", appointmentId: "cita-de-la-mixta" }),
      atencion("v-centavos", { status: "por-cobrar" }),
      atencion("v-cortesia", { status: "por-cobrar" }),
      atencion("v-ex-miembro", { status: "por-cobrar" }),
      atencion("v-en-atencion", { status: "en-atencion" }),
      atencion("v-pedro", { status: "por-cobrar" }),
      atencion("v-ajena", { businessId: OTRO_NEGOCIO, customerId: "c-ajeno", status: "por-cobrar" }),
    ],
    visitService: [
      linea("l-mixta-carla", "v-mixta"),
      lineaDeLaDueña("l-mixta-duena", "v-mixta", { serviceId: "s-color", serviceName: "Color", price: 25000 }),
      linea("l-centavos", "v-centavos", { price: 0.3 }),
      linea("l-cortesia", "v-cortesia", { price: 0 }),
      linea("l-ex-miembro", "v-ex-miembro", { memberId: null, professionalName: "Juan (ya no está)" }),
      linea("l-en-atencion", "v-en-atencion"),
      linea("l-pedro", "v-pedro", { memberId: "m-pedro", professionalName: "Pedro Profesional" }),
      linea("l-ajena", "v-ajena", { memberId: "m-ajeno", serviceId: "s-ajeno" }),
    ],
  }
}

const atencionGuardada = (id: string) => base.buscar("visit", { id })[0]
const pagosDe = (visitId: string) => base.buscar("visitPayment", { visitId })

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  base.reiniciar(escenario())
})

afterEach(() => vi.useRealTimers())

async function cobrar(sesion: unknown, id: string, cuerpo: unknown) {
  const { POST } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return POST(pedido(URL, cuerpo), conId(id))
}

describe("POST /api/atenciones/[id]/cobro: quién cobra", () => {
  it("una atención de otro negocio da 404 y no escribe nada", async () => {
    const antes = base.volcado()

    const res = await cobrar(sesiones.dueña, "v-ajena", { pagos: [{ medio: "efectivo", monto: 8000 }] })

    expect(res.status).toBe(404)
    expect(base.volcado()).toEqual(antes)
    expect(base.prisma.$transaction).not.toHaveBeenCalled()
  })

  it("la profesional ve su atención pero no la cobra: 401, y no escribe nada", async () => {
    const antes = base.volcado()

    const res = await cobrar(sesiones.pedro, "v-pedro", { pagos: [{ medio: "efectivo", monto: 8000 }] })

    expect(res.status).toBe(401)
    expect(base.volcado()).toEqual(antes)
  })

  it("la de un colega ni la ve: 404", async () => {
    const res = await cobrar(sesiones.carla, "v-pedro", { pagos: [{ medio: "efectivo", monto: 8000 }] })

    expect(res.status).toBe(404)
  })

  it("el encargado cobra: es la caja del día", async () => {
    const res = await cobrar(sesiones.encargado, "v-pedro", { pagos: [{ medio: "efectivo", monto: 8000 }] })

    expect(res.status).toBe(200)
    expect(atencionGuardada("v-pedro")).toMatchObject({ status: "finalizada", paidById: "u-encargado" })
  })

  it("sin sesión recibe 401", async () => {
    const res = await cobrar(null, "v-mixta", { pagos: [] })

    expect(res.status).toBe(401)
  })
})

describe("POST /api/atenciones/[id]/cobro: el cobro", () => {
  it("un cobro dividido que suma el total finaliza la atención, crea los pagos y completa la cita", async () => {
    const res = await cobrar(sesiones.dueña, "v-mixta", {
      pagos: [
        { medio: "efectivo", monto: 20000 },
        { medio: "tarjeta-credito", monto: 13000 },
      ],
    })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(atencionGuardada("v-mixta")).toMatchObject({
      status: "finalizada",
      paidAt: AHORA,
      paidById: "u-duena",
      total: 33000,
    })
    expect(pagosDe("v-mixta")).toEqual([
      expect.objectContaining({ method: "efectivo", amount: 20000 }),
      expect.objectContaining({ method: "tarjeta-credito", amount: 13000 }),
    ])
    expect(base.buscar("appointment", { id: "cita-de-la-mixta" })[0]).toMatchObject({ status: "completada", price: 33000 })
    expect(data).toMatchObject({ estado: "finalizada", total: 33000 })
    expect(data.pagos.map((p: { medio: string }) => p.medio)).toEqual(["efectivo", "tarjeta-credito"])
  })

  it("se compara en centavos: 0,10 + 0,20 contra un total de 0,30 se acepta", async () => {
    const res = await cobrar(sesiones.dueña, "v-centavos", {
      pagos: [
        { medio: "efectivo", monto: 0.1 },
        { medio: "transferencia", monto: 0.2 },
      ],
    })

    expect(res.status).toBe(200)
    expect(atencionGuardada("v-centavos")).toMatchObject({ status: "finalizada", total: 0.3 })
  })

  it("si los pagos no suman el total: 400 con las dos cifras, y no se escribe nada", async () => {
    const antes = base.volcado()

    const res = await cobrar(sesiones.dueña, "v-mixta", { pagos: [{ medio: "efectivo", monto: 30000 }] })

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/30\.000.*33\.000/)
    expect(base.volcado()).toEqual(antes)
  })

  it("un total de cero se cobra sin pagos: es una cortesía", async () => {
    const res = await cobrar(sesiones.dueña, "v-cortesia", { pagos: [] })

    expect(res.status).toBe(200)
    expect(atencionGuardada("v-cortesia")).toMatchObject({ status: "finalizada", total: 0 })
    expect(pagosDe("v-cortesia")).toEqual([])
  })

  it.each([
    ["un medio que no existe", [{ medio: "cheque", monto: 33000 }]],
    ["un monto en cero", [{ medio: "efectivo", monto: 33000 }, { medio: "efectivo", monto: 0 }]],
    ["un monto negativo", [{ medio: "efectivo", monto: 34000 }, { medio: "efectivo", monto: -1000 }]],
    ["un monto con fracción de centavo", [{ medio: "efectivo", monto: 32999.995 }, { medio: "efectivo", monto: 0.005 }]],
    ["sin pagos", []],
  ])("%s da 400 y no escribe nada", async (_caso, pagos) => {
    const antes = base.volcado()

    const res = await cobrar(sesiones.dueña, "v-mixta", { pagos })

    expect(res.status).toBe(400)
    expect(base.volcado()).toEqual(antes)
  })

  it("una atención que no está por cobrar da 409", async () => {
    const res = await cobrar(sesiones.dueña, "v-en-atencion", { pagos: [{ medio: "efectivo", monto: 8000 }] })

    expect(res.status).toBe(409)
    expect(atencionGuardada("v-en-atencion").status).toBe("en-atencion")
  })

  it("un doble clic no cobra dos veces: el segundo da 409 y no agrega pagos", async () => {
    const cuerpo = { pagos: [{ medio: "efectivo", monto: 33000 }] }

    const primero = await cobrar(sesiones.dueña, "v-mixta", cuerpo)
    const segundo = await cobrar(sesiones.dueña, "v-mixta", cuerpo)

    expect(primero.status).toBe(200)
    expect(segundo.status).toBe(409)
    expect(pagosDe("v-mixta")).toHaveLength(1)
  })

  it("si se cobra a la vez desde dos cajas, la segunda choca al tomar la fila: 409 y sin pagos de más", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.encargado)
    // Las dos leyeron "por cobrar"; la otra caja termina primero.
    const original = base.prisma.visit.findFirst.getMockImplementation()!
    base.prisma.visit.findFirst.mockImplementationOnce(async (args) => {
      const leida = await original(args)
      await base.prisma.visit.updateMany({ where: { id: "v-mixta" }, data: { status: "finalizada" } })
      return leida
    })

    const res = await POST(pedido(URL, { pagos: [{ medio: "efectivo", monto: 33000 }] }), conId("v-mixta"))

    expect(res.status).toBe(409)
    expect(pagosDe("v-mixta")).toEqual([])
  })

  it("no se cobra un servicio sin profesional: 400, porque no habría a quién pagarle la comisión", async () => {
    const antes = base.volcado()

    const res = await cobrar(sesiones.dueña, "v-ex-miembro", { pagos: [{ medio: "efectivo", monto: 8000 }] })

    expect(res.status).toBe(400)
    expect(base.volcado()).toEqual(antes)
  })
})
