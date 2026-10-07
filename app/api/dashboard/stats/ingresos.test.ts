import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { NextRequest } from "next/server"
import { NEGOCIO, OTRO_NEGOCIO, atencion, datosBase, pago, sesiones } from "@/app/api/atenciones/_pruebas/datos"
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

async function pedir(sesion: unknown, consulta = "") {
  const { GET } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const res = await GET({ url: `http://localhost/api/dashboard/stats${consulta}` } as unknown as NextRequest)
  return { status: res.status, data: await res.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  base.reiniciar(escenario())
})

afterEach(() => vi.useRealTimers())

describe("GET /api/dashboard/stats: ingresos con la zona de quien mira", () => {
  it("son los pagos de las atenciones cobradas en el mes, sumados en centavos exactos", async () => {
    const { status, data } = await pedir(sesiones.dueña, "?zona=America/Santiago")

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

    const { data } = await pedir(sesiones.dueña, "?zona=America/Santiago")

    expect(data.ingresosMes).toBe(0)
    expect(data.atencionesCobradasMes).toBe(0)
  })

  it("lo cobrado por otro negocio no suma, y al revés", async () => {
    const otro = await pedir(sesiones.dueñoAjeno, "?zona=America/Santiago")

    expect(otro.data.ingresosMes).toBe(99000)
    expect(otro.data.atencionesCobradasMes).toBe(1)
  })

  it("el profesional no recibe ingresos, ni su contexto, ni la tendencia, y no se calculan", async () => {
    const { status, data } = await pedir(sesiones.carla, "?zona=America/Santiago")

    expect(status).toBe(200)
    expect(data).not.toHaveProperty("ingresosMes")
    expect(data).not.toHaveProperty("atencionesCobradasMes")
    expect(data.tendencias).not.toHaveProperty("ingresos")
    expect(base.prisma.visitPayment.aggregate).not.toHaveBeenCalled()
    expect(base.prisma.visit.count).not.toHaveBeenCalled()
  })

  it("el cobro del 30 de septiembre a las 22:30 en Santiago es de septiembre: cuenta para la tendencia, no para octubre", async () => {
    const { data } = await pedir(sesiones.dueña, "?zona=America/Santiago")

    // Septiembre: 11.000 + 7.000 del borde. (33.000,30 - 18.000) / 18.000 = 83 %.
    expect(data.tendencias.ingresos).toBe(83)
  })

  it("y a las 22:45 de ese 30 de septiembre, el mes de quien mira todavía es septiembre", async () => {
    vi.setSystemTime(new Date("2026-10-01T01:45:00.000Z"))
    // Lo que ya se había cobrado a esa hora.
    const hastaEntonces = new Set(["v-borde", "v-septiembre"])
    base.reiniciar({
      ...escenario(),
      visit: escenario().visit.filter((v) => hastaEntonces.has(v.id as string)),
      visitPayment: escenario().visitPayment.filter((p) => hastaEntonces.has(p.visitId as string)),
    })

    const { data } = await pedir(sesiones.dueña, "?zona=America/Santiago")

    expect(data.ingresosMes).toBe(18000)
    expect(data.atencionesCobradasMes).toBe(2)
  })

  it("en otra zona, el mismo cobro es de otro mes: en UTC ya es octubre", async () => {
    const { data } = await pedir(sesiones.dueña, "?zona=UTC")

    expect(data.ingresosMes).toBe(40000.3)
    expect(data.atencionesCobradasMes).toBe(3)
  })

  it("sin nada cobrado en el mes: cero y no null, y sin mes anterior la tendencia no viaja", async () => {
    base.reiniciar({ ...datosBase() })

    const { data } = await pedir(sesiones.dueña, "?zona=America/Santiago")

    expect(data.ingresosMes).toBe(0)
    expect(data.atencionesCobradasMes).toBe(0)
    expect(data.tendencias).not.toHaveProperty("ingresos")
  })

  it.each([
    ["una zona que no existe", "Mars/Olympus"],
    ["un desplazamiento en vez de una zona", "-03:00"],
  ])("%s da 400 sin consultar nada", async (_caso, zona) => {
    const { status, data } = await pedir(sesiones.dueña, `?zona=${encodeURIComponent(zona)}`)

    expect(status).toBe(400)
    expect(data.error).toMatch(/zona horaria/)
    expect(base.prisma.visitPayment.aggregate).not.toHaveBeenCalled()
    expect(base.prisma.appointment.findMany).not.toHaveBeenCalled()
  })
})

describe("GET /api/dashboard/stats: ingresos sin zona, como antes", () => {
  /** Sin zona, el mes es el del reloj del servidor: depende del huso donde corra el test. */
  const bordeEsDeOctubre = new Date(BORDE) >= new Date(2026, 9, 1)

  it.each([
    ["sin el parámetro", ""],
    ["con el parámetro vacío", "?zona="],
  ])("%s, el mes es el del servidor", async (_caso, consulta) => {
    const { status, data } = await pedir(sesiones.dueña, consulta)

    expect(status).toBe(200)
    expect(data.ingresosMes).toBe(bordeEsDeOctubre ? 40000.3 : 33000.3)
    expect(data.atencionesCobradasMes).toBe(bordeEsDeOctubre ? 3 : 2)
  })
})
