import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
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
} from "@/pruebas/datos"

/**
 * #66: propinas al cobrar. Van a su tabla, aparte de los pagos: los pagos
 * siguen sumando el total y los ingresos no cambian. El resto del cobro está
 * en `route.test.ts`.
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const URL = "http://localhost/api/atenciones/x/cobro"
const AHORA = new Date("2026-10-06T15:00:00.000Z")
const DIA = "desde=2026-10-06T03:00:00.000Z&hasta=2026-10-07T03:00:00.000Z"

function escenario() {
  return {
    ...datosBase(),
    visit: [
      // Corte de Carla (8.000) + Color de la dueña (25.000) = 33.000.
      atencion("v-mixta", { status: "por-cobrar" }),
      atencion("v-sola", { status: "por-cobrar" }),
    ],
    visitService: [
      linea("l-carla", "v-mixta"),
      lineaDeLaDueña("l-duena", "v-mixta", { serviceId: "s-color", serviceName: "Color", priceCents: centavos(25000) }),
      linea("l-sola", "v-sola"),
    ],
  }
}

const PAGO_EXACTO = [{ medio: "tarjeta-credito", monto: 33000 }]

const propinasDe = (visitId: string) => base.buscar("propinaDeAtencion", { visitId })
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

describe("POST /api/atenciones/[id]/cobro: propinas (#66)", () => {
  it("el encargado registra propinas para Carla y para la dueña: van a su tabla con el nombre de la base, y los pagos siguen sumando el total", async () => {
    const res = await cobrar(sesiones.encargado, "v-mixta", {
      pagos: PAGO_EXACTO,
      propinas: [
        { profesional: "m-carla", monto: 2000, medio: "efectivo", nombre: "Otra" },
        { profesional: "duenio", monto: 1500.5, medio: "tarjeta-debito" },
      ],
    })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(propinasDe("v-mixta")).toEqual([
      expect.objectContaining({
        businessId: NEGOCIO,
        memberId: "m-carla",
        byOwner: false,
        professionalName: "Carla Profesional",
        method: "efectivo",
        amountCents: centavos(2000),
        liquidacionId: null,
      }),
      expect.objectContaining({
        businessId: NEGOCIO,
        memberId: null,
        byOwner: true,
        professionalName: "Ana Dueña",
        method: "tarjeta-debito",
        amountCents: 150050,
      }),
    ])
    // Ni el total ni los pagos cambian por la propina.
    expect(base.buscar("visit", { id: "v-mixta" })[0].totalCents).toBe(centavos(33000))
    expect(pagosDe("v-mixta").map((p) => p.amountCents)).toEqual([centavos(33000)])
    expect(data.total).toBe(33000)
    expect(data.propinas).toEqual([
      { id: expect.any(String), profesional: { id: "m-carla", nombre: "Carla Profesional" }, medio: "efectivo", nombreMedio: "Efectivo", monto: 2000 },
      { id: expect.any(String), profesional: { id: "duenio", nombre: "Ana Dueña" }, medio: "tarjeta-debito", nombreMedio: "Tarjeta de débito", monto: 1500.5 },
    ])
  })

  it("sin propinas se cobra como siempre, y no se crea ninguna", async () => {
    expect((await cobrar(sesiones.dueña, "v-mixta", { pagos: PAGO_EXACTO })).status).toBe(200)
    expect(propinasDe("v-mixta")).toEqual([])
  })

  it("las propinas no se suman a los pagos: pagar el total más la propina como pago es un 400", async () => {
    const antes = base.volcado()

    const res = await cobrar(sesiones.dueña, "v-mixta", {
      pagos: [{ medio: "efectivo", monto: 35000 }],
      propinas: [{ profesional: "m-carla", monto: 2000, medio: "efectivo" }],
    })

    expect(res.status).toBe(400)
    expect(base.volcado()).toEqual(antes)
  })

  it("una propina para un miembro de otro negocio da 404 y no se cobra nada", async () => {
    const antes = base.volcado()

    const res = await cobrar(sesiones.dueña, "v-mixta", {
      pagos: PAGO_EXACTO,
      propinas: [{ profesional: "m-ajeno", monto: 2000, medio: "efectivo" }],
    })

    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe("Profesional no encontrado")
    expect(base.volcado()).toEqual(antes)
  })

  it.each([
    ["un monto en cero", [{ profesional: "m-carla", monto: 0, medio: "efectivo" }]],
    ["un monto negativo", [{ profesional: "m-carla", monto: -100, medio: "efectivo" }]],
    ["un monto con fracción de centavo", [{ profesional: "m-carla", monto: 10.005, medio: "efectivo" }]],
    ["un medio que no existe", [{ profesional: "m-carla", monto: 1000, medio: "cheque" }]],
    ["sin a quién", [{ profesional: "", monto: 1000, medio: "efectivo" }]],
    ["más de 5 propinas", Array.from({ length: 6 }, () => ({ profesional: "m-carla", monto: 100, medio: "efectivo" }))],
  ])("%s da 400 y no se cobra nada", async (_caso, propinas) => {
    const antes = base.volcado()

    const res = await cobrar(sesiones.dueña, "v-mixta", { pagos: PAGO_EXACTO, propinas })

    expect(res.status).toBe(400)
    expect(base.volcado()).toEqual(antes)
  })

  it("hasta 5 propinas sí", async () => {
    const propinas = Array.from({ length: 5 }, () => ({ profesional: "m-carla", monto: 100, medio: "efectivo" }))
    expect((await cobrar(sesiones.dueña, "v-mixta", { pagos: PAGO_EXACTO, propinas })).status).toBe(200)
    expect(propinasDe("v-mixta")).toHaveLength(5)
  })

  it("la profesional no registra propinas: no cobra, 401 y nada se escribe", async () => {
    const antes = base.volcado()

    const res = await cobrar(sesiones.carla, "v-sola", {
      pagos: [{ medio: "efectivo", monto: 8000 }],
      propinas: [{ profesional: "m-carla", monto: 5000, medio: "efectivo" }],
    })

    expect(res.status).toBe(401)
    expect(base.volcado()).toEqual(antes)
  })

  it("un doble cobro no duplica las propinas: el segundo da 409", async () => {
    const cuerpo = { pagos: PAGO_EXACTO, propinas: [{ profesional: "m-carla", monto: 2000, medio: "efectivo" }] }

    expect((await cobrar(sesiones.dueña, "v-mixta", cuerpo)).status).toBe(200)
    expect((await cobrar(sesiones.dueña, "v-mixta", cuerpo)).status).toBe(409)
    expect(propinasDe("v-mixta")).toHaveLength(1)
  })
})

describe("las propinas no cambian los ingresos (#66)", () => {
  async function ingresosDelReporte(): Promise<number> {
    const { GET } = await import("@/app/api/reportes/route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const res = await GET(pedido(`http://localhost/api/reportes?${DIA}&zona=America/Santiago`))
    return (await res.json()).resumen.ingresos
  }

  it("el reporte de lo cobrado da lo mismo con o sin propina", async () => {
    await cobrar(sesiones.dueña, "v-mixta", { pagos: PAGO_EXACTO })
    const sinPropina = await ingresosDelReporte()

    base.reiniciar(escenario())
    await cobrar(sesiones.dueña, "v-mixta", {
      pagos: PAGO_EXACTO,
      propinas: [{ profesional: "m-carla", monto: 5000, medio: "efectivo" }],
    })
    const conPropina = await ingresosDelReporte()

    expect(sinPropina).toBe(33000)
    expect(conPropina).toBe(sinPropina)
  })

  it("los ingresos del inicio suman pagos (VisitPayment), y la propina no crea ninguno", async () => {
    await cobrar(sesiones.dueña, "v-mixta", {
      pagos: PAGO_EXACTO,
      propinas: [{ profesional: "m-carla", monto: 5000, medio: "efectivo" }],
    })

    expect(base.buscar("visitPayment", {}).reduce((suma, p) => suma + (p.amountCents as number), 0)).toBe(centavos(33000))
  })
})

describe("GET /api/atenciones: quién ve las propinas (#66)", () => {
  async function tablero(sesion: unknown) {
    const { GET } = await import("../../route")
    mockGetServerSession.mockResolvedValueOnce(sesion)
    return (await GET(pedido(`http://localhost/api/atenciones?${DIA}`))).json()
  }

  beforeEach(async () => {
    await cobrar(sesiones.dueña, "v-mixta", {
      pagos: PAGO_EXACTO,
      propinas: [{ profesional: "m-carla", monto: 2000, medio: "efectivo" }],
    })
  })

  it("dueña y encargado las ven en la atención cobrada, aparte del total", async () => {
    for (const sesion of [sesiones.dueña, sesiones.encargado]) {
      const mixta = (await tablero(sesion)).atenciones.find((a: { id: string }) => a.id === "v-mixta")
      expect(mixta.total).toBe(33000)
      expect(mixta.propinas.map((p: { monto: number }) => p.monto)).toEqual([2000])
    }
  })

  it("a la profesional no le viajan, como los pagos", async () => {
    const mixta = (await tablero(sesiones.carla)).atenciones.find((a: { id: string }) => a.id === "v-mixta")
    expect(mixta).not.toHaveProperty("propinas")
    expect(mixta).not.toHaveProperty("pagos")
  })

  it("el dueño de otro negocio no las ve", async () => {
    const data = await tablero(sesiones.dueñoAjeno)
    expect(data.atenciones).toEqual([])
    expect(base.buscar("propinaDeAtencion", {}).every((p) => p.businessId !== OTRO_NEGOCIO)).toBe(true)
  })
})
