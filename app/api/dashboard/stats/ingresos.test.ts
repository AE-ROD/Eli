import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { NEGOCIO, OTRO_NEGOCIO, atencion, datosBase, pago, sesiones } from "@/pruebas/datos"
import { crearBaseDeEstadisticas } from "./_pruebas/base-de-estadisticas"

/**
 * Los ingresos del inicio, contra datos: qué pagos suman, en qué mes cae cada
 * cobro según la zona, y quién recibe la cifra. El resto de la respuesta
 * (citas de hoy, clientes, horario) está en `route.test.ts`.
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseDeEstadisticas()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/** 15 de octubre de 2026, 12:00 en Santiago (UTC-3). */
const AHORA = new Date("2026-10-15T15:00:00.000Z")

/** El 30 de septiembre a las 22:30 en Santiago: en UTC ya es 1 de octubre. */
const BORDE = "2026-10-01T01:30:00.000Z"

const cobrada = (id: string, paidAt: string, datos: Record<string, unknown> = {}) =>
  atencion(id, { status: "finalizada", paidAt: new Date(paidAt), ...datos })

function escenario() {
  return {
    ...datosBase(),
    appointment: [
      // Completada a mano en la agenda, con precio, sin pasar por el cobro: no suma.
      { id: "cita-completada", businessId: NEGOCIO, customerId: "c-maria", title: "Corte", status: "completada", price: 50000, startTime: new Date("2026-10-09T15:00:00.000Z"), endTime: new Date("2026-10-09T15:30:00.000Z") },
    ],
    visit: [
      cobrada("v-octubre", "2026-10-05T15:00:00.000Z"),
      cobrada("v-octubre-centavos", "2026-10-10T15:00:00.000Z"),
      cobrada("v-borde", BORDE),
      cobrada("v-septiembre", "2026-09-20T15:00:00.000Z"),
      // Cobrada en octubre y anulada después: conserva sus pagos, pero no suma.
      atencion("v-anulada", { status: "anulada", paidAt: new Date("2026-10-08T15:00:00.000Z"), voidedAt: new Date("2026-10-08T18:00:00.000Z") }),
      atencion("v-abierta", { status: "por-cobrar" }),
      cobrada("v-ajena", "2026-10-05T15:00:00.000Z", { businessId: OTRO_NEGOCIO, customerId: "c-ajeno" }),
    ],
    visitPayment: [
      pago("p-octubre-1", "v-octubre", "efectivo", 20000),
      pago("p-octubre-2", "v-octubre", "tarjeta-credito", 13000),
      pago("p-centavos-1", "v-octubre-centavos", "efectivo", 0.1),
      pago("p-centavos-2", "v-octubre-centavos", "transferencia", 0.2),
      pago("p-borde", "v-borde", "efectivo", 7000),
      pago("p-septiembre", "v-septiembre", "efectivo", 11000),
      pago("p-anulada", "v-anulada", "efectivo", 50000),
      pago("p-ajena", "v-ajena", "efectivo", 99000),
    ],
  }
}

async function pedir(sesion: unknown) {
  const { GET } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const res = await GET()
  return { status: res.status, data: await res.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  base.reiniciar(escenario())
})

afterEach(() => vi.useRealTimers())

describe("GET /api/dashboard/stats: ingresos en la zona del negocio", () => {
  it("son los pagos de las atenciones cobradas en el mes, sumados en centavos exactos", async () => {
    const { status, data } = await pedir(sesiones.dueña)

    expect(status).toBe(200)
    // 20.000 + 13.000 + 0,10 + 0,20. Ni la anulada, ni la abierta, ni la cita
    // completada a mano, ni el otro negocio, ni el cobro del 30 de septiembre.
    expect(data.ingresosMes).toBe(33000.3)
    expect(data.atencionesCobradasMes).toBe(2)
  })

  it("una atención anulada no suma aunque conserve sus pagos", async () => {
    base.reiniciar({
      ...escenario(),
      visit: escenario().visit.filter((v) => v.id === "v-anulada"),
      visitPayment: escenario().visitPayment.filter((p) => p.visitId === "v-anulada"),
    })

    const { data } = await pedir(sesiones.dueña)

    expect(data.ingresosMes).toBe(0)
    expect(data.atencionesCobradasMes).toBe(0)
  })

  it("lo cobrado por otro negocio no suma, y al revés", async () => {
    const otro = await pedir(sesiones.dueñoAjeno)

    expect(otro.data.ingresosMes).toBe(99000)
    expect(otro.data.atencionesCobradasMes).toBe(1)
  })

  it("el profesional no recibe ingresos, ni su contexto, ni la tendencia, y no se calculan", async () => {
    const { status, data } = await pedir(sesiones.carla)

    expect(status).toBe(200)
    expect(data).not.toHaveProperty("ingresosMes")
    expect(data).not.toHaveProperty("atencionesCobradasMes")
    expect(data.tendencias).not.toHaveProperty("ingresos")
    expect(base.prisma.visitPayment.aggregate).not.toHaveBeenCalled()
    expect(base.prisma.visit.count).not.toHaveBeenCalled()
  })

  it("el cobro del 30 de septiembre a las 22:30 en Santiago es de septiembre: cuenta para la tendencia, no para octubre", async () => {
    const { data } = await pedir(sesiones.dueña)

    // Septiembre: 11.000 + 7.000 del borde. (33.000,30 - 18.000) / 18.000 = 83 %.
    expect(data.tendencias.ingresos).toBe(83)
  })

  it("y a las 22:45 de ese 30 de septiembre, el mes del negocio todavía es septiembre", async () => {
    vi.setSystemTime(new Date("2026-10-01T01:45:00.000Z"))
    // Lo que ya se había cobrado a esa hora.
    const hastaEntonces = new Set(["v-borde", "v-septiembre"])
    base.reiniciar({
      ...escenario(),
      visit: escenario().visit.filter((v) => hastaEntonces.has(v.id as string)),
      visitPayment: escenario().visitPayment.filter((p) => hastaEntonces.has(p.visitId as string)),
    })

    const { data } = await pedir(sesiones.dueña)

    expect(data.ingresosMes).toBe(18000)
    expect(data.atencionesCobradasMes).toBe(2)
  })

  it("en un negocio en UTC, el mismo cobro es de otro mes: ya es octubre", async () => {
    const datos = escenario()
    base.reiniciar({
      ...datos,
      business: datos.business.map((negocio) => (negocio.id === NEGOCIO ? { ...negocio, timezone: "UTC" } : negocio)),
    })

    const { data } = await pedir(sesiones.dueña)

    expect(data.zona).toBe("UTC")
    expect(data.ingresosMes).toBe(40000.3)
    expect(data.atencionesCobradasMes).toBe(3)
  })

  it("sin nada cobrado en el mes: cero y no null, y sin mes anterior la tendencia no viaja", async () => {
    base.reiniciar({ ...datosBase() })

    const { data } = await pedir(sesiones.dueña)

    expect(data.ingresosMes).toBe(0)
    expect(data.atencionesCobradasMes).toBe(0)
    expect(data.tendencias).not.toHaveProperty("ingresos")
  })
})

describe("GET /api/dashboard/stats: la zona del navegador no cuenta", () => {
  it.each([
    ["sin el parámetro", ""],
    ["con otra zona", "?zona=UTC"],
    ["con una zona inválida", "?zona=Mars/Olympus"],
  ])("%s, el mes es el del negocio (Santiago)", async (_caso, consulta) => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    // El handler no lee el pedido: aunque el panel viejo mande `zona`, no cambia nada.
    const res = await (GET as unknown as (pedido: unknown) => Promise<Response>)({
      url: `http://localhost/api/dashboard/stats${consulta}`,
    })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.zona).toBe("America/Santiago")
    expect(data.ingresosMes).toBe(33000.3)
  })
})
