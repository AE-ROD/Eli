import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, atencion, centavos, conId, datosBase, linea, pedido, sesiones } from "@/pruebas/datos"
import { sesionesDentales } from "@/pruebas/clinica-con-sillones"

/**
 * Paquetes de sesiones en el cobro (`lib/paquetes.ts`): vender uno, usar una
 * sesión, lo que queda pagado con el medio interno "paquete", la comisión de
 * cada cosa y el aislamiento entre negocios y entre clientas.
 */

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
const mockAvisar = vi.fn()
vi.mock("@/lib/avisos-de-paquetes", () => ({ avisarSaldoDePaquetes: (...args: unknown[]) => mockAvisar(...args) }))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const URL = "http://localhost/api/atenciones/x/cobro"
const AHORA = new Date("2026-10-06T15:00:00.000Z")

/** 6 sesiones de Corte por 42.000: cada una vale 7.000 (suelta, 8.000). */
const DEFINICION = { id: "pq-corte", businessId: NEGOCIO, serviceId: "s-corte", sesiones: 6, priceCents: centavos(42000), vigenciaMeses: 6 }

/** Un paquete que María ya compró (en `v-venta`, cobrada antes) y del que lleva `usadas` sesiones. */
function yaComprado(id: string, usadas: number, datos: Record<string, unknown> = {}) {
  return {
    visit: [atencion(`v-venta-${id}`, { status: "finalizada", paidAt: new Date("2026-09-01T15:00:00Z") }), ...Array.from({ length: usadas }, (_, i) => atencion(`v-uso-${id}-${i}`, { status: "finalizada", paidAt: new Date("2026-09-10T15:00:00Z") }))],
    visitService: [
      linea(`l-venta-${id}`, `v-venta-${id}`, { serviceName: "Paquete de 6 sesiones: Corte", priceCents: centavos(42000) }),
      ...Array.from({ length: usadas }, (_, i) => linea(`l-uso-${id}-${i}`, `v-uso-${id}-${i}`, { priceCents: centavos(7000) })),
    ],
    paqueteDeCliente: [
      {
        id,
        businessId: NEGOCIO,
        customerId: "c-maria",
        serviceId: "s-corte",
        serviceName: "Corte",
        sesiones: 6,
        priceCents: centavos(42000),
        valorPorSesionCents: centavos(7000),
        lineaDeVentaId: `l-venta-${id}`,
        vendidoAt: new Date("2026-09-01T15:00:00Z"),
        ...datos,
      },
    ],
    usoDePaquete: Array.from({ length: usadas }, (_, i) => ({ id: `u-${id}-${i}`, businessId: NEGOCIO, paqueteId: id, lineaId: `l-uso-${id}-${i}` })),
  }
}

function escenario(extra: Record<string, unknown[]> = {}) {
  const inicial: Record<string, unknown[]> = {
    ...datosBase(),
    businessMember: (datosBase().businessMember as Record<string, unknown>[]).map((miembro) =>
      miembro.id === "m-carla" ? { ...miembro, commissionPercent: 40 } : miembro
    ),
    visit: [atencion("v-hoy", { status: "por-cobrar" })],
    // Un Corte de Carla a 8.000.
    visitService: [linea("l-hoy", "v-hoy")],
    paqueteDeSesiones: [DEFINICION, { ...DEFINICION, id: "pq-ajeno", businessId: OTRO_NEGOCIO, serviceId: "s-ajeno" }],
    paqueteDeCliente: [],
    usoDePaquete: [],
  }
  for (const [tabla, filas] of Object.entries(extra)) inicial[tabla] = [...(inicial[tabla] ?? []), ...filas]
  return inicial
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  base.reiniciar(escenario())
})
afterEach(() => vi.useRealTimers())

async function cobrar(sesion: unknown, cuerpo: unknown, id = "v-hoy") {
  const { POST } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const respuesta = await POST(pedido(URL, cuerpo), conId(id))
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const pagos = (visitId = "v-hoy") => base.buscar("visitPayment", { visitId }).map((pago) => [pago.method, pago.amountCents])
const lineaDe = (id: string) => base.buscar("visitService", { id })[0]

describe("vender un paquete al cobrar", () => {
  it("agrega la línea del paquete, cobra todo junto y crea el paquete de la clienta con su vencimiento", async () => {
    const { status } = await cobrar(sesiones.dueña, {
      pagos: [{ medio: "efectivo", monto: 50000 }],
      paquetes: { ventas: [{ paqueteId: "pq-corte" }] },
    })
    expect(status).toBe(200)

    const [paquete] = base.buscar("paqueteDeCliente")
    expect(paquete).toMatchObject({
      businessId: NEGOCIO,
      customerId: "c-maria",
      serviceId: "s-corte",
      serviceName: "Corte",
      sesiones: 6,
      priceCents: centavos(42000),
      valorPorSesionCents: centavos(7000),
      vendidoAt: AHORA,
      venceAt: new Date("2027-04-06T15:00:00.000Z"),
    })
    const venta = lineaDe(paquete.lineaDeVentaId as string)
    expect(venta).toMatchObject({ visitId: "v-hoy", serviceName: "Paquete de 6 sesiones: Corte", priceCents: centavos(42000), byOwner: true, memberId: null })
    expect(base.buscar("visit", { id: "v-hoy" })[0]).toMatchObject({ status: "finalizada", totalCents: centavos(50000) })
    expect(pagos()).toEqual([["efectivo", centavos(50000)]])
  })

  it("vendido por el encargado: la línea queda a su nombre con la comisión congelada en 0 %, nunca pendiente", async () => {
    await cobrar(sesiones.encargado, { pagos: [{ medio: "efectivo", monto: 50000 }], paquetes: { ventas: [{ paqueteId: "pq-corte" }] } })
    const [paquete] = base.buscar("paqueteDeCliente")
    expect(lineaDe(paquete.lineaDeVentaId as string)).toMatchObject({
      memberId: "m-encargado",
      byOwner: false,
      commissionPercent: 0,
      commissionCents: 0,
      commissionAt: AHORA,
    })
  })

  it("compra y usa la primera sesión hoy: paga sólo el paquete, y la línea de hoy queda con el valor de la sesión", async () => {
    const { status } = await cobrar(sesiones.dueña, {
      pagos: [{ medio: "tarjeta-debito", monto: 42000 }],
      paquetes: { ventas: [{ paqueteId: "pq-corte" }], usos: [{ lineaId: "l-hoy", venta: 0 }] },
    })
    expect(status).toBe(200)
    expect(lineaDe("l-hoy")).toMatchObject({ priceCents: centavos(7000), commissionPercent: 40, commissionCents: centavos(2800) })
    expect(pagos().sort()).toEqual([
      ["paquete", centavos(7000)],
      ["tarjeta-debito", centavos(42000)],
    ])
    const [paquete] = base.buscar("paqueteDeCliente")
    expect(base.buscar("usoDePaquete")).toMatchObject([{ paqueteId: paquete.id, lineaId: "l-hoy", businessId: NEGOCIO }])
  })

  it("los pagos tienen que sumar lo que falta, ni más ni menos", async () => {
    const { status, cuerpo } = await cobrar(sesiones.dueña, {
      pagos: [{ medio: "efectivo", monto: 8000 }],
      paquetes: { ventas: [{ paqueteId: "pq-corte" }] },
    })
    expect(status).toBe(400)
    expect(cuerpo.error).toContain("$50.000")
    expect(base.buscar("paqueteDeCliente")).toEqual([])
    expect(base.buscar("visit", { id: "v-hoy" })[0].status).toBe("por-cobrar")
  })

  it("un paquete de otro negocio, pausado o de un servicio pausado no existe: 404 y no se cobra nada", async () => {
    for (const paqueteId of ["pq-ajeno", "no-existe"]) {
      const { status } = await cobrar(sesiones.dueña, { pagos: [{ medio: "efectivo", monto: 50000 }], paquetes: { ventas: [{ paqueteId }] } })
      expect(status).toBe(404)
    }
    base.reiniciar(escenario({ paqueteDeSesiones: [{ ...DEFINICION, id: "pq-pausado", active: false }] }))
    expect((await cobrar(sesiones.dueña, { pagos: [{ medio: "efectivo", monto: 50000 }], paquetes: { ventas: [{ paqueteId: "pq-pausado" }] } })).status).toBe(404)
    expect(base.buscar("paqueteDeCliente")).toEqual([])
    expect(base.buscar("visit", { id: "v-hoy" })[0].status).toBe("por-cobrar")
  })

  it("sin clienta en la atención no se vende: 400", async () => {
    base.reiniciar({ ...escenario(), visit: [atencion("v-hoy", { status: "por-cobrar", customerId: null })] })
    const { status, cuerpo } = await cobrar(sesiones.dueña, { pagos: [{ medio: "efectivo", monto: 50000 }], paquetes: { ventas: [{ paqueteId: "pq-corte" }] } })
    expect(status).toBe(400)
    expect(cuerpo.error).toContain("clienta de tu lista")
  })
})

describe("usar una sesión de un paquete ya comprado", () => {
  it("la sesión queda pagada con el paquete: no pide plata, la línea vale la sesión y la comisión es de quien atiende", async () => {
    base.reiniciar(escenario(yaComprado("pc-1", 2)))
    const { status } = await cobrar(sesiones.encargado, { pagos: [], paquetes: { usos: [{ lineaId: "l-hoy", paqueteDeClienteId: "pc-1" }] } })
    expect(status).toBe(200)
    expect(pagos()).toEqual([["paquete", centavos(7000)]])
    expect(lineaDe("l-hoy")).toMatchObject({ priceCents: centavos(7000), memberId: "m-carla", commissionPercent: 40, commissionCents: centavos(2800), commissionAt: AHORA })
    expect(base.buscar("usoDePaquete", { paqueteId: "pc-1" })).toHaveLength(3)
    expect(base.buscar("visit", { id: "v-hoy" })[0]).toMatchObject({ status: "finalizada", totalCents: centavos(7000) })
    expect(mockAvisar).not.toHaveBeenCalled()
  })

  it("con otros servicios en la misma atención, se paga sólo lo que el paquete no cubre", async () => {
    base.reiniciar(
      escenario({
        ...yaComprado("pc-1", 0),
        visitService: [...(yaComprado("pc-1", 0).visitService as unknown[]), linea("l-color", "v-hoy", { serviceId: "s-color", serviceName: "Color", priceCents: centavos(25000) })],
      })
    )
    const sinPagar = await cobrar(sesiones.dueña, { pagos: [], paquetes: { usos: [{ lineaId: "l-hoy", paqueteDeClienteId: "pc-1" }] } })
    expect(sinPagar.status).toBe(400)
    const { status } = await cobrar(sesiones.dueña, { pagos: [{ medio: "efectivo", monto: 25000 }], paquetes: { usos: [{ lineaId: "l-hoy", paqueteDeClienteId: "pc-1" }] } })
    expect(status).toBe(200)
    expect(pagos().sort()).toEqual([
      ["efectivo", centavos(25000)],
      ["paquete", centavos(7000)],
    ])
  })

  it("avisa a la clienta cuando le queda una sesión y cuando usó la última", async () => {
    base.reiniciar(escenario(yaComprado("pc-1", 4)))
    await cobrar(sesiones.dueña, { pagos: [], paquetes: { usos: [{ lineaId: "l-hoy", paqueteDeClienteId: "pc-1" }] } })
    expect(mockAvisar).toHaveBeenCalledWith(NEGOCIO, "v-hoy", [{ paqueteId: "pc-1", servicio: "Corte", sesiones: 6, restantes: 1 }])
  })

  it.each([
    ["sin sesiones", yaComprado("pc-1", 6), "no le quedan sesiones"],
    ["vencido", yaComprado("pc-1", 1, { venceAt: new Date("2026-10-01T00:00:00Z") }), "vencido"],
    ["devuelto", yaComprado("pc-1", 1, { devueltoAt: new Date("2026-10-01T00:00:00Z"), devueltoCents: 100, devueltoMedio: "efectivo", devueltoPorNombre: "Ana" }), "devuelto"],
  ])("un paquete %s no se usa: 409 y no se cobra", async (_caso, datos, texto) => {
    base.reiniciar(escenario(datos))
    const { status, cuerpo } = await cobrar(sesiones.dueña, { pagos: [], paquetes: { usos: [{ lineaId: "l-hoy", paqueteDeClienteId: "pc-1" }] } })
    expect(status).toBe(409)
    expect(cuerpo.error).toContain(texto)
    expect(base.buscar("visit", { id: "v-hoy" })[0].status).toBe("por-cobrar")
    expect(lineaDe("l-hoy").priceCents).toBe(centavos(8000))
  })

  it("si la atención donde se vendió quedó anulada, el paquete no vale", async () => {
    const datos = yaComprado("pc-1", 0)
    datos.visit = [atencion("v-venta-pc-1", { status: "anulada" })]
    base.reiniciar(escenario(datos))
    expect((await cobrar(sesiones.dueña, { pagos: [], paquetes: { usos: [{ lineaId: "l-hoy", paqueteDeClienteId: "pc-1" }] } })).status).toBe(409)
  })

  it("las sesiones usadas en atenciones anuladas no cuentan: vuelven al paquete", async () => {
    const datos = yaComprado("pc-1", 6)
    datos.visit = datos.visit.map((visita) => (visita.id === "v-uso-pc-1-0" ? { ...visita, status: "anulada" } : visita))
    base.reiniciar(escenario(datos))
    expect((await cobrar(sesiones.dueña, { pagos: [], paquetes: { usos: [{ lineaId: "l-hoy", paqueteDeClienteId: "pc-1" }] } })).status).toBe(200)
  })

  it("el paquete de otra clienta, o de otro negocio, no existe: 404", async () => {
    base.reiniciar(escenario(yaComprado("pc-1", 0, { customerId: "c-otra" })))
    expect((await cobrar(sesiones.dueña, { pagos: [], paquetes: { usos: [{ lineaId: "l-hoy", paqueteDeClienteId: "pc-1" }] } })).status).toBe(404)
    expect((await cobrar(sesiones.dueña, { pagos: [], paquetes: { usos: [{ lineaId: "l-hoy", paqueteDeClienteId: "no-existe" }] } })).status).toBe(404)
  })

  it("un paquete de otro servicio no paga esta línea: 400", async () => {
    base.reiniciar(escenario(yaComprado("pc-1", 0, { serviceId: "s-color", serviceName: "Color" })))
    expect((await cobrar(sesiones.dueña, { pagos: [], paquetes: { usos: [{ lineaId: "l-hoy", paqueteDeClienteId: "pc-1" }] } })).status).toBe(400)
  })

  it("una línea de otra atención no se paga desde ésta: 404", async () => {
    base.reiniciar(escenario(yaComprado("pc-1", 1)))
    expect((await cobrar(sesiones.dueña, { pagos: [{ medio: "efectivo", monto: 8000 }], paquetes: { usos: [{ lineaId: "l-uso-pc-1-0", paqueteDeClienteId: "pc-1" }] } })).status).toBe(404)
  })

  it("la misma línea dos veces, o sin decir de qué paquete: 400", async () => {
    base.reiniciar(escenario(yaComprado("pc-1", 0)))
    const dosVeces = { usos: [{ lineaId: "l-hoy", paqueteDeClienteId: "pc-1" }, { lineaId: "l-hoy", paqueteDeClienteId: "pc-1" }] }
    expect((await cobrar(sesiones.dueña, { pagos: [], paquetes: dosVeces })).status).toBe(400)
    expect((await cobrar(sesiones.dueña, { pagos: [], paquetes: { usos: [{ lineaId: "l-hoy" }] } })).status).toBe(400)
    expect((await cobrar(sesiones.dueña, { pagos: [], paquetes: { usos: [{ lineaId: "l-hoy", venta: 0 }] } })).status).toBe(400)
  })
})

describe("quién puede", () => {
  it("el profesional no cobra, con o sin paquetes: 401", async () => {
    base.reiniciar(escenario(yaComprado("pc-1", 0)))
    expect((await cobrar(sesiones.carla, { pagos: [], paquetes: { usos: [{ lineaId: "l-hoy", paqueteDeClienteId: "pc-1" }] } })).status).toBe(401)
  })

  it("en la clínica dental no hay paquetes: 401 aunque el navegador los mande", async () => {
    const { status } = await cobrar({ user: { ...sesionesDentales.dueña.user, businessId: NEGOCIO } }, { pagos: [{ medio: "efectivo", monto: 50000 }], paquetes: { ventas: [{ paqueteId: "pq-corte" }] } })
    expect(status).toBe(401)
    expect(base.buscar("paqueteDeCliente")).toEqual([])
  })

  it("el medio «paquete» no se puede mandar a mano como pago", async () => {
    const { status } = await cobrar(sesiones.dueña, { pagos: [{ medio: "paquete", monto: 8000 }] })
    expect(status).toBe(400)
    expect(pagos()).toEqual([])
  })
})
