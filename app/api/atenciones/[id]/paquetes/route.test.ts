import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, atencion, centavos, conId, datosBase, linea, pedido, sesiones } from "@/pruebas/datos"
import { sesionesDentales } from "@/pruebas/clinica-con-sillones"

/**
 * Lo que el cobro del Tablero lee de los paquetes de sesiones: quién puede,
 * qué se ofrece para vender, qué le queda a la clienta de la atención y el
 * aislamiento entre negocios y entre clientas.
 */

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const URL = "http://localhost/api/atenciones/x/paquetes"
const AHORA = new Date("2026-10-06T15:00:00.000Z")

/** 6 sesiones de Corte por 42.000: cada una vale 7.000. */
const DEFINICION = { id: "pq-corte", businessId: NEGOCIO, serviceId: "s-corte", sesiones: 6, priceCents: centavos(42000), vigenciaMeses: 6 }

/** Un paquete de 6 Cortes ya comprado (por María, salvo que se pise) del que se usaron `usadas` sesiones. */
function yaComprado(id: string, usadas: number, datos: Record<string, unknown> = {}) {
  const businessId = (datos.businessId as string | undefined) ?? NEGOCIO
  return {
    visit: [
      atencion(`v-venta-${id}`, { businessId, status: "finalizada", paidAt: new Date("2026-09-01T15:00:00Z") }),
      ...Array.from({ length: usadas }, (_, i) =>
        atencion(`v-uso-${id}-${i}`, { businessId, status: "finalizada", paidAt: new Date("2026-09-10T15:00:00Z") })
      ),
    ],
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
    usoDePaquete: Array.from({ length: usadas }, (_, i) => ({ id: `u-${id}-${i}`, businessId, paqueteId: id, lineaId: `l-uso-${id}-${i}` })),
  }
}

function escenario(...extras: Record<string, unknown[]>[]) {
  const inicial: Record<string, unknown[]> = {
    ...datosBase(),
    visit: [
      atencion("v-hoy", { status: "por-cobrar" }),
      atencion("v-sin-clienta", { status: "por-cobrar", customerId: null, customerName: "Alguien de paso" }),
      atencion("v-ajena", { businessId: OTRO_NEGOCIO, customerId: "c-ajeno", status: "por-cobrar" }),
    ],
    visitService: [linea("l-hoy", "v-hoy")],
    paqueteDeSesiones: [DEFINICION],
    paqueteDeCliente: [],
    usoDePaquete: [],
  }
  for (const extra of extras) {
    for (const [tabla, filas] of Object.entries(extra)) inicial[tabla] = [...(inicial[tabla] ?? []), ...filas]
  }
  return inicial
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  base.reiniciar(escenario())
})
afterEach(() => vi.useRealTimers())

async function leer(sesion: unknown, id = "v-hoy") {
  const { GET } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const respuesta = await GET(pedido(URL), conId(id))
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const ids = (lista: { id: string }[]) => lista.map((paquete) => paquete.id)

describe("quién puede", () => {
  it("la dueña y el encargado, que son quienes cobran", async () => {
    expect((await leer(sesiones.dueña)).status).toBe(200)
    expect((await leer(sesiones.encargado)).status).toBe(200)
  })

  it("sin sesión: 401", async () => {
    expect((await leer(null)).status).toBe(401)
  })

  it("el profesional ve su atención pero no cobra: 401, y no recibe nada", async () => {
    const { status, cuerpo } = await leer(sesiones.carla)
    expect(status).toBe(401)
    expect(cuerpo).toEqual({ error: "No autorizado" })
  })

  it("en la clínica dental no hay paquetes: 401 también para la dueña", async () => {
    const { status, cuerpo } = await leer(sesionesDentales.dueña)
    expect(status).toBe(401)
    expect(cuerpo).toEqual({ error: "No autorizado" })
  })
})

describe("aislamiento entre negocios (404, nunca 403)", () => {
  it("una atención de otro negocio no existe, ni una que no existe", async () => {
    expect((await leer(sesiones.dueña, "v-ajena")).status).toBe(404)
    expect((await leer(sesiones.dueñoAjeno, "v-hoy")).status).toBe(404)
    expect((await leer(sesiones.dueña, "v-nada")).status).toBe(404)
  })

  it("no ofrece los paquetes de otro negocio, ni muestra los que compró una clienta de otro negocio", async () => {
    base.reiniciar(
      escenario(
        { paqueteDeSesiones: [{ ...DEFINICION, id: "pq-ajeno", businessId: OTRO_NEGOCIO, serviceId: "s-ajeno" }] },
        yaComprado("pc-mio", 1),
        // Mismos ids de clienta y de servicio a propósito: sólo el negocio lo distingue.
        yaComprado("pc-ajeno", 0, { businessId: OTRO_NEGOCIO })
      )
    )
    const { cuerpo } = await leer(sesiones.dueña)
    expect(ids(cuerpo.ofrecidos)).toEqual(["pq-corte"])
    expect(ids(cuerpo.deLaClienta)).toEqual(["pc-mio"])

    const ajeno = await leer(sesiones.dueñoAjeno, "v-ajena")
    expect(ids(ajeno.cuerpo.ofrecidos)).toEqual(["pq-ajeno"])
    expect(ajeno.cuerpo.deLaClienta).toEqual([])
  })

  it("no muestra los paquetes de otra clienta del mismo negocio", async () => {
    base.reiniciar(escenario(yaComprado("pc-beto", 0, { customerId: "c-beto" })))
    expect((await leer(sesiones.dueña)).cuerpo.deLaClienta).toEqual([])
  })
})

describe("lo que se ofrece para vender", () => {
  it("cada paquete con su servicio, su precio y lo que vale cada sesión, en pesos", async () => {
    const { cuerpo } = await leer(sesiones.dueña)
    expect(cuerpo.tieneClienta).toBe(true)
    expect(cuerpo.ofrecidos).toEqual([
      { id: "pq-corte", servicioId: "s-corte", servicio: "Corte", sesiones: 6, precio: 42000, valorPorSesion: 7000, vigenciaMeses: 6 },
    ])
  })

  it("sólo los activos, y de un servicio activo", async () => {
    base.reiniciar(
      escenario({
        paqueteDeSesiones: [
          { ...DEFINICION, id: "pq-apagado", active: false },
          { ...DEFINICION, id: "pq-de-servicio-viejo", serviceId: "s-viejo" },
          { ...DEFINICION, id: "pq-color", serviceId: "s-color", sesiones: 3, priceCents: centavos(60000), vigenciaMeses: null },
        ],
      })
    )
    const { cuerpo } = await leer(sesiones.dueña)
    expect(ids(cuerpo.ofrecidos)).toEqual(["pq-color", "pq-corte"])
    expect(cuerpo.ofrecidos[0]).toMatchObject({ servicio: "Color", precio: 60000, valorPorSesion: 20000, vigenciaMeses: null })
  })
})

describe("lo que le queda a la clienta", () => {
  it("su paquete con las sesiones que le quedan y lo que vale cada una", async () => {
    base.reiniciar(escenario(yaComprado("pc-1", 2, { venceAt: new Date("2027-03-01T15:00:00Z") })))
    const { cuerpo } = await leer(sesiones.encargado)
    expect(cuerpo.deLaClienta).toEqual([
      { id: "pc-1", servicioId: "s-corte", servicio: "Corte", sesiones: 6, restantes: 4, valorPorSesion: 7000, venceEl: "2027-03-01T15:00:00.000Z" },
    ])
  })

  it("no llegan los terminados, los vencidos, los devueltos ni los de una venta anulada", async () => {
    const anulado = yaComprado("pc-anulado", 0)
    anulado.visit[0] = { ...anulado.visit[0], status: "anulada" }
    base.reiniciar(
      escenario(
        yaComprado("pc-vigente", 5),
        yaComprado("pc-terminado", 6),
        yaComprado("pc-vencido", 1, { venceAt: new Date("2026-10-01T15:00:00Z") }),
        yaComprado("pc-devuelto", 1, { devueltoAt: new Date("2026-09-20T15:00:00Z"), devueltoCents: centavos(35000) }),
        anulado
      )
    )
    const { cuerpo } = await leer(sesiones.dueña)
    expect(ids(cuerpo.deLaClienta)).toEqual(["pc-vigente"])
    expect(cuerpo.deLaClienta[0].restantes).toBe(1)
  })

  it("una sesión usada en una atención anulada vuelve a contar como disponible", async () => {
    const comprado = yaComprado("pc-1", 2)
    comprado.visit[1] = { ...comprado.visit[1], status: "anulada" }
    base.reiniciar(escenario(comprado))
    expect((await leer(sesiones.dueña)).cuerpo.deLaClienta[0].restantes).toBe(5)
  })

  it("una atención sin clienta de la lista: no hay de quién leer, y se dice", async () => {
    base.reiniciar(escenario(yaComprado("pc-1", 0)))
    const { status, cuerpo } = await leer(sesiones.dueña, "v-sin-clienta")
    expect(status).toBe(200)
    expect(cuerpo.tieneClienta).toBe(false)
    expect(cuerpo.deLaClienta).toEqual([])
    expect(ids(cuerpo.ofrecidos)).toEqual(["pq-corte"])
  })
})
