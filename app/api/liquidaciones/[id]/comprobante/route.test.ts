import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, atencion, centavos, conId, datosBase, linea, pedido, sesiones } from "@/pruebas/datos"
import { leerCsv } from "@/lib/csv"

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockVerificarLimite = vi.fn(async (..._args: unknown[]) => ({ permitido: true, restantes: 10 }))
vi.mock("@/lib/rate-limit", () => ({ verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args) }))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const URL = "http://localhost/api/liquidaciones/liq-carla/comprobante"
const enSesion = (sesion: unknown) => mockGetServerSession.mockResolvedValue(sesion)

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar({
    ...datosBase(),
    liquidacion: [
      {
        id: "liq-carla",
        businessId: NEGOCIO,
        memberId: "m-carla",
        memberName: "Carla Profesional",
        periodo: "mensual",
        desde: new Date("2026-10-01T00:00:00.000Z"),
        hasta: new Date("2026-10-31T00:00:00.000Z"),
        zona: "America/Santiago",
        comisionServiciosCents: centavos(3200),
        comisionProductosCents: 0,
        propinasCents: 0,
        adelantosCents: centavos(1000),
        ajustesCents: -centavos(200),
        brutoCents: centavos(3200),
        totalCents: centavos(2000),
        cerradaPorId: "u-duena",
        cerradaPorNombre: "Ana Dueña",
      },
    ],
    visit: [
      atencion("v-1", {
        status: "finalizada",
        customerName: '=HYPERLINK("http://malo.test","clic")',
        paidAt: new Date("2026-10-06T15:00:00.000Z"),
      }),
    ],
    visitService: [
      linea("l-1", "v-1", {
        commissionPercent: 40,
        commissionCents: centavos(3200),
        commissionAt: new Date("2026-10-06T15:00:00.000Z"),
        liquidacionId: "liq-carla",
      }),
    ],
    movimientoDeLiquidacion: [
      {
        id: "mv-1",
        businessId: NEGOCIO,
        memberId: "m-carla",
        memberName: "Carla Profesional",
        tipo: "adelanto",
        montoCents: centavos(1000),
        fecha: new Date("2026-10-10T00:00:00.000Z"),
        liquidacionId: "liq-carla",
        createdById: "u-duena",
        createdByName: "Ana Dueña",
      },
      {
        id: "mv-2",
        businessId: NEGOCIO,
        memberId: "m-carla",
        memberName: "Carla Profesional",
        tipo: "ajuste",
        montoCents: -centavos(200),
        fecha: new Date("2026-10-12T00:00:00.000Z"),
        motivo: "-1+1",
        liquidacionId: "liq-carla",
        createdById: "u-duena",
        createdByName: "Ana Dueña",
      },
    ],
  })
})

describe("GET /api/liquidaciones/[id]/comprobante", () => {
  it("descarga el CSV de la propia, con fórmulas neutralizadas y descuentos en negativo", async () => {
    const { GET } = await import("./route")
    enSesion(sesiones.carla)
    const res = await GET(pedido(URL), conId("liq-carla"))
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="liquidacion-carla-profesional-2026-10-01-al-2026-10-31.csv"'
    )
    expect(res.headers.get("Cache-Control")).toBe("no-store")

    const filas = leerCsv(await res.text())
    expect(filas[1]).toEqual(["Profesional", "Carla Profesional"])
    const lineaDelCliente = filas.find((fila) => fila[0] === "2026-10-06")!
    expect(lineaDelCliente[1]).toBe(`'=HYPERLINK("http://malo.test","clic")`)
    expect(lineaDelCliente.slice(4)).toEqual(["8000", "40", "3200"])
    expect(filas.find((fila) => fila[1] === "Adelanto")).toEqual(["2026-10-10", "Adelanto", "", "-1000"])
    expect(filas.find((fila) => fila[1] === "Ajuste")).toEqual(["2026-10-12", "Ajuste", "'-1+1", "-200"])
    expect(filas.find((fila) => fila[0] === "Total a pagar")).toEqual(["Total a pagar", "2000"])

    expect(mockVerificarLimite).toHaveBeenCalledWith("exportacion", "usuario:u-carla")
  })

  it("la ajena: 404; sin sesión: 401; sobre el límite: 429", async () => {
    const { GET } = await import("./route")
    for (const sesion of [sesiones.pedro, sesiones.dueñoAjeno, sesiones.sinMiembro]) {
      enSesion(sesion)
      expect((await GET(pedido(URL), conId("liq-carla"))).status).toBe(404)
    }
    enSesion(null)
    expect((await GET(pedido(URL), conId("liq-carla"))).status).toBe(401)

    enSesion(sesiones.dueña)
    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })
    expect((await GET(pedido(URL), conId("liq-carla"))).status).toBe(429)
    expect((await GET(pedido(URL), conId("liq-carla"))).status).toBe(200)
  })
})
