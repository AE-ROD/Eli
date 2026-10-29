import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import {
  NEGOCIO,
  atencion,
  centavos,
  conId,
  datosBase,
  linea,
  lineaDeLaDueña,
  lineaDeProducto,
  pedido,
  sesiones,
} from "@/pruebas/datos"

/**
 * #65: al cobrar, cada línea congela su comisión con los % de ese momento.
 * El resto del cobro (pagos, permisos, topes) está en `route.test.ts`.
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

/**
 * Carla tiene 40 % por defecto y 33,33 % en Color; Pedro no tiene % (pendiente).
 * Shampoo lleva 10 %; Cera, sin %.
 */
function escenario() {
  const datos = datosBase()
  return {
    ...datos,
    businessMember: datos.businessMember.map((miembro) =>
      miembro.id === "m-carla" ? { ...miembro, commissionPercent: 40 } : miembro
    ),
    commissionRate: [{ id: "cr-1", businessId: NEGOCIO, memberId: "m-carla", serviceId: "s-color", percent: 33.33 }],
    visit: [atencion("v1", { status: "por-cobrar" })],
    visitService: [
      // 40 % de $14.990: 599.600 centavos.
      linea("l-corte", "v1", { priceCents: centavos(14990) }),
      // La excepción gana: 33,33 % de $14.990 = 4.996,167 → 499.617 centavos.
      linea("l-color", "v1", { serviceId: "s-color", serviceName: "Color", priceCents: centavos(14990) }),
      // Sin % de Pedro: pendiente.
      linea("l-pedro", "v1", { memberId: "m-pedro", professionalName: "Pedro Profesional" }),
      // La dueña no se paga comisión.
      lineaDeLaDueña("l-duena", "v1"),
      // Producto: el % del producto, no el de quien lo vende.
      lineaDeProducto("l-shampoo", "v1"),
      lineaDeProducto("l-cera", "v1", { productId: "p-cera", serviceName: "Cera", priceCents: centavos(8000) }),
    ],
  }
}

const TOTAL = 14990 + 14990 + 8000 + 8000 + 12000 + 8000

const lineaGuardada = (id: string) => base.buscar("visitService", { id })[0]

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  base.reiniciar(escenario())
})

afterEach(() => vi.useRealTimers())

async function cobrar(sesion: unknown = sesiones.dueña) {
  const { POST } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  return POST(pedido(URL, { pagos: [{ medio: "efectivo", monto: TOTAL }] }), conId("v1"))
}

describe("POST /api/atenciones/[id]/cobro: comisión congelada por línea (#65)", () => {
  it("cada línea de un miembro congela % y monto en centavos exactos, con la hora del cobro", async () => {
    const res = await cobrar()

    expect(res.status).toBe(200)
    expect(lineaGuardada("l-corte")).toMatchObject({ commissionPercent: 40, commissionCents: 599_600, commissionAt: AHORA })
    expect(lineaGuardada("l-color")).toMatchObject({ commissionPercent: 33.33, commissionCents: 499_617, commissionAt: AHORA })
    expect(lineaGuardada("l-shampoo")).toMatchObject({ commissionPercent: 10, commissionCents: 120_000, commissionAt: AHORA })
  })

  it("sin % configurado queda pendiente: las tres columnas en null, nunca 0, y el cobro pasa igual", async () => {
    const res = await cobrar()

    expect(res.status).toBe(200)
    for (const id of ["l-pedro", "l-cera"]) {
      expect(lineaGuardada(id)).toMatchObject({ commissionPercent: null, commissionCents: null, commissionAt: null })
    }
    expect(base.buscar("visit", { id: "v1" })[0].status).toBe("finalizada")
  })

  it("la línea de la dueña nunca lleva comisión", async () => {
    await cobrar()

    expect(lineaGuardada("l-duena")).toMatchObject({ commissionPercent: null, commissionCents: null, commissionAt: null })
  })

  it("la respuesta dice en qué quedó cada línea: congelada con su % y monto, pendiente o no aplica", async () => {
    const data = await (await cobrar(sesiones.encargado)).json()
    const comision = (id: string) => data.lineas.find((l: { id: string }) => l.id === id).comision

    expect(comision("l-corte")).toEqual({ estado: "congelada", porcentaje: 40, monto: 5996 })
    expect(comision("l-pedro")).toEqual({ estado: "pendiente" })
    expect(comision("l-cera")).toEqual({ estado: "pendiente" })
    expect(comision("l-duena")).toEqual({ estado: "no-aplica" })
  })

  it("cambiar el % después no toca lo cobrado: la comisión no se recalcula", async () => {
    await cobrar()
    // La dueña sube a Carla al 50 % y le pone % a Pedro y a la Cera.
    await base.prisma.businessMember.updateMany({ where: { id: "m-carla" }, data: { commissionPercent: 50 } })
    await base.prisma.businessMember.updateMany({ where: { id: "m-pedro" }, data: { commissionPercent: 30 } })
    await base.prisma.producto.updateMany({ where: { id: "p-cera" }, data: { commissionPercent: 20 } })

    const { GET } = await import("../../route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const tablero = await (
      await GET(pedido("http://localhost/api/atenciones?desde=2026-10-06T03:00:00.000Z&hasta=2026-10-07T03:00:00.000Z"))
    ).json()
    const lineas = tablero.atenciones.find((a: { id: string }) => a.id === "v1").lineas

    expect(lineaGuardada("l-corte")).toMatchObject({ commissionPercent: 40, commissionCents: 599_600 })
    expect(lineas.find((l: { id: string }) => l.id === "l-corte").comision).toEqual({ estado: "congelada", porcentaje: 40, monto: 5996 })
    // Lo pendiente sigue pendiente: se congela al cerrar la liquidación, no acá.
    expect(lineaGuardada("l-pedro").commissionAt).toBeNull()
  })

  it("un doble cobro congela una sola vez: el segundo da 409 y no toca las comisiones", async () => {
    await cobrar()
    const congeladas = base.buscar("visitService", { visitId: "v1" })
    vi.setSystemTime(new Date("2026-10-06T15:05:00.000Z"))
    await base.prisma.businessMember.updateMany({ where: { id: "m-carla" }, data: { commissionPercent: 50 } })

    const segundo = await cobrar()

    expect(segundo.status).toBe(409)
    expect(base.buscar("visitService", { visitId: "v1" })).toEqual(congeladas)
  })

  it("si el cobro falla (los pagos no cuadran), no se congela nada", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const res = await POST(pedido(URL, { pagos: [{ medio: "efectivo", monto: 1 }] }), conId("v1"))

    expect(res.status).toBe(400)
    expect(base.buscar("visitService", { visitId: "v1" }).every((l) => l.commissionAt === null)).toBe(true)
  })

  it("una excepción de otro miembro o de otro servicio no se aplica: Carla en Corte usa su 40 %", async () => {
    base.reiniciar({
      ...escenario(),
      commissionRate: [
        { id: "cr-1", businessId: NEGOCIO, memberId: "m-carla", serviceId: "s-color", percent: 33.33 },
        { id: "cr-2", businessId: NEGOCIO, memberId: "m-pedro", serviceId: "s-corte", percent: 90 },
      ],
    })

    await cobrar()

    expect(lineaGuardada("l-corte")).toMatchObject({ commissionPercent: 40 })
    // Pedro tiene excepción en Corte: su línea de Corte la usa aunque no tenga % por defecto.
    expect(lineaGuardada("l-pedro")).toMatchObject({ commissionPercent: 90, commissionCents: 720_000 })
  })
})

describe("GET /api/atenciones: la profesional y las comisiones (#65)", () => {
  it("ve el % y el monto de sus líneas cobradas, y nunca recibe las líneas ajenas ni sus comisiones", async () => {
    await cobrar()

    const { GET } = await import("../../route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.carla)
    const respuesta = await GET(
      pedido("http://localhost/api/atenciones?desde=2026-10-06T03:00:00.000Z&hasta=2026-10-07T03:00:00.000Z")
    )
    const texto = await respuesta.text()
    const lineas = JSON.parse(texto).atenciones.find((a: { id: string }) => a.id === "v1").lineas

    expect(lineas.map((l: { id: string }) => l.id).sort()).toEqual(["l-cera", "l-color", "l-corte", "l-shampoo"])
    expect(lineas.find((l: { id: string }) => l.id === "l-color").comision).toEqual({
      estado: "congelada",
      porcentaje: 33.33,
      monto: 4996.17,
    })
    // Ni la línea de Pedro ni la de la dueña viajan.
    expect(texto).not.toContain("l-pedro")
    expect(texto).not.toContain("l-duena")
  })
})

describe("GET /api/atenciones/[id]/cobro: qué quedará sin % antes de cobrar (#118)", () => {
  async function antesDeCobrar(sesion: unknown, id = "v1") {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesion)
    return GET(pedido(URL), conId(id))
  }

  it("dice qué líneas quedarían pendientes de % con los porcentajes de ahora, sin escribir nada", async () => {
    const antes = base.volcado()

    const res = await antesDeCobrar(sesiones.encargado)

    expect(res.status).toBe(200)
    // Pedro sin %, Cera sin %; la dueña no aplica; Carla y Shampoo tienen %.
    expect((await res.json()).lineasSinPorcentaje.sort()).toEqual(["l-cera", "l-pedro"])
    expect(base.volcado()).toEqual(antes)
  })

  it("con el % recién configurado, la línea ya no se avisa", async () => {
    base.reiniciar({
      ...escenario(),
      businessMember: escenario().businessMember.map((miembro) =>
        miembro.id === "m-pedro" ? { ...miembro, commissionPercent: 30 } : miembro
      ),
    })

    const res = await antesDeCobrar(sesiones.dueña)

    expect((await res.json()).lineasSinPorcentaje).toEqual(["l-cera"])
  })

  it("la atención de otro negocio: 404", async () => {
    const res = await antesDeCobrar(sesiones.dueñoAjeno)

    expect(res.status).toBe(404)
  })

  it("la profesional que ve la atención pero no cobra: 401", async () => {
    const res = await antesDeCobrar(sesiones.carla)

    expect(res.status).toBe(401)
  })

  it("sin sesión: 401", async () => {
    const res = await antesDeCobrar(null)

    expect(res.status).toBe(401)
  })
})
