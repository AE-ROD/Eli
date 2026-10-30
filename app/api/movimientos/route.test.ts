import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, atencion, centavos, conId, datosBase, pedido, sesiones } from "@/pruebas/datos"

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/** Domingo 1 de noviembre de 2026 a las 00:30 en Santiago (UTC-3). */
const AHORA = new Date("2026-11-01T03:30:00.000Z")
const URL = "http://localhost/api/movimientos"

const enSesion = (sesion: unknown) => mockGetServerSession.mockResolvedValue(sesion)

function movimiento(id: string, datos: Record<string, unknown> = {}) {
  return {
    id,
    businessId: NEGOCIO,
    memberId: "m-carla",
    memberName: "Carla Profesional",
    tipo: "adelanto",
    montoCents: centavos(5000),
    fecha: new Date("2026-10-10T00:00:00.000Z"),
    createdById: "u-duena",
    createdByName: "Ana Dueña",
    createdAt: new Date("2026-10-10T12:00:00.000Z"),
    ...datos,
  }
}

function escenario() {
  return {
    ...datosBase(),
    visit: [atencion("v-1"), atencion("v-ajena", { businessId: OTRO_NEGOCIO, customerId: "c-ajeno" })],
    liquidacion: [
      {
        id: "liq-1",
        businessId: NEGOCIO,
        memberId: "m-carla",
        memberName: "Carla Profesional",
        periodo: "mensual",
        desde: new Date("2026-09-01T00:00:00.000Z"),
        hasta: new Date("2026-09-30T00:00:00.000Z"),
        zona: "America/Santiago",
        comisionServiciosCents: 0,
        comisionProductosCents: 0,
        propinasCents: 0,
        adelantosCents: centavos(1000),
        ajustesCents: 0,
        brutoCents: 0,
        totalCents: 0,
        cerradaPorId: "u-duena",
        cerradaPorNombre: "Ana Dueña",
      },
    ],
    movimientoDeLiquidacion: [
      movimiento("mv-carla"),
      movimiento("mv-ajuste", { tipo: "ajuste", montoCents: -centavos(800), motivo: "Cobro de más" }),
      movimiento("mv-liquidado", { montoCents: centavos(1000), liquidacionId: "liq-1" }),
      movimiento("mv-pedro", { memberId: "m-pedro", memberName: "Pedro Profesional" }),
      movimiento("mv-ajeno", { businessId: OTRO_NEGOCIO, memberId: "m-ajeno", memberName: "Carla Profesional", createdById: "u-otro" }),
    ],
  }
}

const registrar = async (cuerpo: unknown) => {
  const { POST } = await import("./route")
  return POST(pedido(URL, cuerpo))
}
const anular = async (id: string) => {
  const { POST } = await import("./[id]/anulacion/route")
  return POST(pedido(`${URL}/${id}/anulacion`), conId(id))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  base.reiniciar(escenario())
})

afterEach(() => {
  vi.useRealTimers()
})

describe("POST /api/movimientos", () => {
  it("el encargado registra un adelanto; sin fecha, hoy en la zona del negocio", async () => {
    enSesion(sesiones.encargado)
    const res = await registrar({ miembroId: "m-carla", tipo: "adelanto", monto: 15000.5 })
    expect(res.status).toBe(201)
    const creado = await res.json()
    // 03:30Z del 1 de noviembre son las 00:30 del 1 en Santiago.
    expect(creado).toMatchObject({ tipo: "adelanto", montoCents: 1500050, fecha: "2026-11-01", miembro: "Carla Profesional" })
    expect(base.buscar("movimientoDeLiquidacion", { id: creado.id })[0]).toMatchObject({
      businessId: NEGOCIO,
      createdById: "u-encargado",
      createdByName: "Bruno Encargado",
      liquidacionId: null,
    })
  })

  it("la dueña registra un ajuste negativo con motivo y la atención que corrige", async () => {
    enSesion(sesiones.dueña)
    const res = await registrar({
      miembroId: "m-pedro",
      tipo: "ajuste",
      monto: -2500,
      fecha: "2026-10-15",
      motivo: "Corte cobrado dos veces",
      atencionId: "v-1",
    })
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ tipo: "ajuste", montoCents: -250000, fecha: "2026-10-15", visitId: "v-1" })
  })

  it("el encargado no registra ajustes y el profesional nada: 401", async () => {
    enSesion(sesiones.encargado)
    expect((await registrar({ miembroId: "m-carla", tipo: "ajuste", monto: 100, motivo: "x" })).status).toBe(401)
    for (const sesion of [sesiones.carla, sesiones.sinMiembro]) {
      enSesion(sesion)
      expect((await registrar({ miembroId: "m-carla", tipo: "vale", monto: 100 })).status).toBe(401)
    }
    expect(base.buscar("movimientoDeLiquidacion")).toHaveLength(5)
  })

  it("miembro o atención de otro negocio: 404", async () => {
    enSesion(sesiones.dueña)
    expect((await registrar({ miembroId: "m-ajeno", tipo: "vale", monto: 100 })).status).toBe(404)
    expect(
      (await registrar({ miembroId: "m-carla", tipo: "ajuste", monto: 100, motivo: "x", atencionId: "v-ajena" })).status
    ).toBe(404)
    enSesion(sesiones.dueñoAjeno)
    expect((await registrar({ miembroId: "m-carla", tipo: "vale", monto: 100 })).status).toBe(404)
    expect(base.buscar("movimientoDeLiquidacion")).toHaveLength(5)
  })

  it("con \"Liquidar desde\" fijado, una fecha anterior es 400; ese mismo día se acepta", async () => {
    const datos = escenario()
    base.reiniciar({
      ...datos,
      business: datos.business.map((b) =>
        b.id === NEGOCIO ? { ...b, liquidacionDesde: new Date("2026-10-15T00:00:00.000Z") } : b
      ),
    })
    enSesion(sesiones.dueña)
    const antes = await registrar({ miembroId: "m-carla", tipo: "vale", monto: 100, fecha: "2026-10-14" })
    expect(antes.status).toBe(400)
    expect((await antes.json()).error).toMatch(/Liquidar desde.*15 oct 2026/)
    expect(base.buscar("movimientoDeLiquidacion")).toHaveLength(5)

    const mismoDia = await registrar({ miembroId: "m-carla", tipo: "vale", monto: 100, fecha: "2026-10-15" })
    expect(mismoDia.status).toBe(201)
    // Sin fecha es hoy (1 nov), posterior al corte.
    expect((await registrar({ miembroId: "m-carla", tipo: "vale", monto: 100 })).status).toBe(201)
  })

  it("lee \"Liquidar desde\" bajo el candado de liquidaciones del negocio, compartido", async () => {
    enSesion(sesiones.dueña)
    expect((await registrar({ miembroId: "m-carla", tipo: "vale", monto: 100 })).status).toBe(201)
    const candados = base.prisma.$executeRaw.mock.calls.map(([partes, ...valores]) => [partes.join("?"), ...valores])
    expect(candados).toEqual([["SELECT pg_advisory_xact_lock_shared(hashtext(?))", `liquidaciones:${NEGOCIO}`]])
    // Antes de leer la fecha: un cambio en curso termina antes y se usa la nueva.
    expect(base.prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      base.prisma.business.findUnique.mock.invocationCallOrder[0]
    )
  })

  it.each([
    [{ tipo: "adelanto", monto: 0 }, /mayor que/],
    [{ tipo: "vale", monto: -100 }, /mayor que/],
    [{ tipo: "adelanto", monto: 10.005 }, /dos decimales/],
    [{ tipo: "adelanto", monto: 20_000_001 }, /demasiado grande/],
    [{ tipo: "ajuste", monto: 0, motivo: "x" }, /\$0/],
    [{ tipo: "ajuste", monto: 100 }, /motivo/],
    [{ tipo: "ajuste", monto: 100, motivo: "   " }, /motivo/],
    [{ tipo: "propina", monto: 100 }, /adelanto, vale o ajuste/],
    [{ tipo: "vale", monto: 100, fecha: "2026-02-30" }, /fecha/],
  ])("rechaza %o con 400", async (datos, mensaje) => {
    enSesion(sesiones.dueña)
    const res = await registrar({ miembroId: "m-carla", ...datos })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(mensaje)
  })
})

describe("GET /api/movimientos", () => {
  const listar = async (consulta = "") => {
    const { GET } = await import("./route")
    return (await (await GET(pedido(`${URL}${consulta}`))).json()).map((m: { id: string }) => m.id).sort()
  }

  it("la gestión ve los del negocio; ?pendientes=1 deja afuera lo liquidado", async () => {
    enSesion(sesiones.encargado)
    expect(await listar()).toEqual(["mv-ajuste", "mv-carla", "mv-liquidado", "mv-pedro"])
    expect(await listar("?pendientes=1&miembro=m-carla")).toEqual(["mv-ajuste", "mv-carla"])
  })

  it("?pendientes=1 aplica el corte de \"Liquidar desde\": lo anterior nunca se liquida, no está pendiente", async () => {
    const datos = escenario()
    base.reiniciar({
      ...datos,
      business: datos.business.map((b) =>
        b.id === NEGOCIO ? { ...b, liquidacionDesde: new Date("2026-10-10T00:00:00.000Z") } : b
      ),
      movimientoDeLiquidacion: [
        ...datos.movimientoDeLiquidacion,
        movimiento("mv-anterior", { fecha: new Date("2026-10-09T00:00:00.000Z") }),
      ],
    })
    enSesion(sesiones.encargado)
    // El mismo día del corte entra; el anterior no.
    expect(await listar("?pendientes=1&miembro=m-carla")).toEqual(["mv-ajuste", "mv-carla"])
    // Sin `pendientes`, el historial sigue mostrándolo.
    expect(await listar("?miembro=m-carla")).toEqual(["mv-ajuste", "mv-anterior", "mv-carla", "mv-liquidado"])
  })

  it("el profesional solo los suyos, aunque pida otro", async () => {
    enSesion(sesiones.pedro)
    expect(await listar()).toEqual(["mv-pedro"])
    expect(await listar("?miembro=m-carla")).toEqual([])
    enSesion(sesiones.sinMiembro)
    expect(await listar()).toEqual([])
  })
})

describe("POST /api/movimientos/[id]/anulacion", () => {
  it("anula un adelanto pendiente y queda quién lo anuló", async () => {
    enSesion(sesiones.encargado)
    const res = await anular("mv-carla")
    expect(res.status).toBe(200)
    expect(base.buscar("movimientoDeLiquidacion", { id: "mv-carla" })[0]).toMatchObject({
      anuladoAt: AHORA,
      anuladoPorId: "u-encargado",
      anuladoPorNombre: "Bruno Encargado",
    })
    expect((await anular("mv-carla")).status).toBe(409)
  })

  it("lo liquidado no se anula: 409", async () => {
    enSesion(sesiones.dueña)
    const res = await anular("mv-liquidado")
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/liquidación/)
  })

  it("el ajuste lo anula solo la dueña; el profesional ve el suyo pero no lo anula; lo ajeno 404", async () => {
    enSesion(sesiones.encargado)
    expect((await anular("mv-ajuste")).status).toBe(401)
    enSesion(sesiones.carla)
    expect((await anular("mv-carla")).status).toBe(401)
    expect((await anular("mv-pedro")).status).toBe(404)
    enSesion(sesiones.dueña)
    expect((await anular("mv-ajeno")).status).toBe(404)
    expect((await anular("mv-ajuste")).status).toBe(200)
  })
})
