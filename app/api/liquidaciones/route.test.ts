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
  lineaDeProducto,
  pedido,
  propina,
  sesiones,
} from "@/pruebas/datos"
import type { Prisma } from "@prisma/client"
import { atencionBloqueada } from "@/lib/bloqueos-de-dinero"

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/** Martes 3 de noviembre de 2026, mediodía en Santiago (UTC-3). */
const AHORA = new Date("2026-11-03T15:00:00.000Z")
const URL = "http://localhost/api/liquidaciones"

const cobrada = (id: string, paidAt: string, datos: Record<string, unknown> = {}) =>
  atencion(id, { status: "finalizada", paidAt: new Date(paidAt), ...datos })

/**
 * Carla tiene 40 % configurado. Octubre de 2026 en Santiago va del 1 a las
 * 00:00 (03:00Z) al 1 de noviembre a las 00:00 (03:00Z).
 */
function escenario() {
  const datos = datosBase()
  return {
    ...datos,
    // La dueña liquida desde el 1 de octubre.
    business: datos.business.map((b) => (b.id === NEGOCIO ? { ...b, liquidacionDesde: dia("2026-10-01") } : b)),
    businessMember: datos.businessMember.map((m) => (m.id === "m-carla" ? { ...m, commissionPercent: 40 } : m)),
    visit: [
      cobrada("v-congelada", "2026-10-06T15:00:00.000Z"),
      cobrada("v-pendiente", "2026-10-07T15:00:00.000Z"),
      // El 31 de octubre a las 23:59 en Santiago: es de octubre.
      cobrada("v-borde-oct", "2026-11-01T02:59:00.000Z"),
      // El 1 de noviembre a las 00:00: ya es de noviembre.
      cobrada("v-borde-nov", "2026-11-01T03:00:00.000Z"),
      atencion("v-anulada", { status: "anulada", paidAt: new Date("2026-10-08T15:00:00.000Z") }),
      atencion("v-abierta", { status: "por-cobrar" }),
      cobrada("v-ajena", "2026-10-06T15:00:00.000Z", { businessId: OTRO_NEGOCIO, customerId: "c-ajeno" }),
    ],
    visitService: [
      linea("l-congelada", "v-congelada", { commissionPercent: 40, commissionCents: centavos(3200), commissionAt: new Date("2026-10-06T15:00:00.000Z") }),
      lineaDeLaDueña("l-duena", "v-congelada", { serviceId: "s-color", serviceName: "Color", priceCents: centavos(25000) }),
      linea("l-pendiente", "v-pendiente"),
      lineaDeProducto("l-shampoo", "v-pendiente"),
      linea("l-pedro", "v-pendiente", { memberId: "m-pedro", professionalName: "Pedro Profesional" }),
      linea("l-borde-oct", "v-borde-oct", { priceCents: centavos(10000) }),
      linea("l-borde-nov", "v-borde-nov"),
      linea("l-anulada", "v-anulada"),
      linea("l-abierta", "v-abierta"),
      linea("l-ajena", "v-ajena", { memberId: "m-ajeno", serviceId: "s-ajeno" }),
    ],
    propinaDeAtencion: [
      propina("pr-carla", "v-congelada"),
      propina("pr-anulada", "v-anulada"),
      propina("pr-nov", "v-borde-nov", { amountCents: centavos(500) }),
    ],
    movimientoDeLiquidacion: [
      movimiento("mv-adelanto", "adelanto", centavos(5000), "2026-10-10"),
      movimiento("mv-ajuste", "ajuste", centavos(1000), "2026-10-20", { motivo: "Corte mal cobrado" }),
      movimiento("mv-vale-nov", "vale", centavos(300), "2026-11-02"),
      movimiento("mv-anulado", "adelanto", centavos(999), "2026-10-11", { anuladoAt: new Date("2026-10-12") }),
      movimiento("mv-pedro", "adelanto", centavos(700), "2026-10-11", { memberId: "m-pedro", memberName: "Pedro Profesional" }),
    ],
  }
}

const dia = (fecha: string) => new Date(`${fecha}T00:00:00.000Z`)

function movimiento(id: string, tipo: string, montoCents: number, fecha: string, datos: Record<string, unknown> = {}) {
  return {
    id,
    businessId: NEGOCIO,
    memberId: "m-carla",
    memberName: "Carla Profesional",
    tipo,
    montoCents,
    fecha: new Date(`${fecha}T00:00:00.000Z`),
    createdById: "u-duena",
    createdByName: "Ana Dueña",
    createdAt: new Date(`${fecha}T12:00:00.000Z`),
    ...datos,
  }
}

const enSesion = (sesion: unknown) => mockGetServerSession.mockResolvedValue(sesion)
const vista = async (miembro = "m-carla", excluir = "") => {
  const { GET } = await import("./vista-previa/route")
  return GET(pedido(`${URL}/vista-previa?miembro=${miembro}${excluir ? `&excluir=${excluir}` : ""}`))
}
const cerrar = async (cuerpo: Record<string, unknown>) => {
  const { POST } = await import("./route")
  return POST(pedido(URL, cuerpo))
}
const lineaGuardada = (id: string) => base.buscar("visitService", { id })[0]

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  base.reiniciar(escenario())
})

afterEach(() => {
  vi.useRealTimers()
})

describe("GET /api/liquidaciones/vista-previa", () => {
  it("calcula octubre para Carla: congeladas, por congelar, propinas, adelantos y ajustes", async () => {
    enSesion(sesiones.dueña)
    const res = await vista()
    expect(res.status).toBe(200)
    const cuerpo = await res.json()

    expect(cuerpo.periodo).toMatchObject({ tipo: "mensual", desde: "2026-10-01", hasta: "2026-10-31" })
    expect(cuerpo.lineas.map((l: { id: string }) => l.id).sort()).toEqual(
      ["l-borde-oct", "l-congelada", "l-pendiente", "l-shampoo"].sort()
    )
    const porId = Object.fromEntries(cuerpo.lineas.map((l: { id: string }) => [l.id, l]))
    expect(porId["l-congelada"]).toMatchObject({ estado: "congelada", porcentaje: 40, comisionCents: 320000 })
    expect(porId["l-pendiente"]).toMatchObject({ estado: "se-congelara", porcentaje: 40, comisionCents: 320000 })
    expect(porId["l-shampoo"]).toMatchObject({ estado: "se-congelara", porcentaje: 10, comisionCents: 120000, tipo: "producto" })
    expect(porId["l-borde-oct"]).toMatchObject({ fecha: "2026-10-31", comisionCents: 400000 })

    expect(cuerpo.propinas.map((p: { id: string }) => p.id)).toEqual(["pr-carla"])
    expect(cuerpo.movimientos.map((m: { id: string }) => m.id)).toEqual(["mv-adelanto", "mv-ajuste"])
    expect(cuerpo.totales).toEqual({
      comisionServiciosCents: centavos(3200 + 3200 + 4000),
      comisionProductosCents: centavos(1200),
      propinasCents: centavos(2000),
      adelantosCents: centavos(5000),
      ajustesCents: centavos(1000),
      brutoCents: centavos(10400 + 1200 + 2000),
      totalCents: centavos(13600 - 5000 + 1000),
    })
    expect(cuerpo.noSePuedeCerrar).toBeNull()
  })

  it("no guarda nada", async () => {
    enSesion(sesiones.dueña)
    const antes = base.volcado()
    await vista()
    expect(base.volcado()).toEqual(antes)
  })

  it("encargado y profesional: 401; miembro de otro negocio: 404", async () => {
    for (const sesion of [sesiones.encargado, sesiones.carla, sesiones.sinMiembro]) {
      enSesion(sesion)
      expect((await vista()).status).toBe(401)
    }
    enSesion(sesiones.dueña)
    expect((await vista("m-ajeno")).status).toBe(404)
    enSesion(sesiones.dueñoAjeno)
    expect((await vista("m-carla")).status).toBe(404)
  })

  it("con líneas sin % no se puede cerrar, y lo dice", async () => {
    enSesion(sesiones.dueña)
    const cuerpo = await (await vista("m-pedro")).json()
    expect(cuerpo.sinPorcentaje).toBe(1)
    expect(cuerpo.lineas[0]).toMatchObject({ id: "l-pedro", estado: "sin-porcentaje", comisionCents: null })
    expect(cuerpo.noSePuedeCerrar).toMatch(/1 servicio sin porcentaje/)
  })

  it("una excepción por servicio le gana al % del miembro", async () => {
    base.reiniciar({
      ...escenario(),
      commissionRate: [{ id: "cr-1", businessId: NEGOCIO, memberId: "m-carla", serviceId: "s-corte", percent: 33.33 }],
    })
    enSesion(sesiones.dueña)
    const cuerpo = await (await vista()).json()
    const pendiente = cuerpo.lineas.find((l: { id: string }) => l.id === "l-pendiente")
    // 33,33 % de $8.000 = $2.666,40.
    expect(pendiente).toMatchObject({ estado: "se-congelara", porcentaje: 33.33, comisionCents: 266640 })
  })
})

describe("POST /api/liquidaciones (cerrar)", () => {
  it("cierra octubre: congela lo pendiente y marca líneas, propinas y movimientos", async () => {
    enSesion(sesiones.dueña)
    const res = await cerrar({ miembroId: "m-carla", desde: "2026-10-01" })
    expect(res.status).toBe(201)
    const creada = await res.json()
    expect(creada).toMatchObject({ desde: "2026-10-01", hasta: "2026-10-31", estado: "cerrada", totalCents: centavos(9600) })

    const [guardada] = base.buscar("liquidacion")
    expect(guardada).toMatchObject({
      businessId: NEGOCIO,
      memberId: "m-carla",
      memberName: "Carla Profesional",
      periodo: "mensual",
      zona: "America/Santiago",
      comisionServiciosCents: centavos(10400),
      comisionProductosCents: centavos(1200),
      propinasCents: centavos(2000),
      adelantosCents: centavos(5000),
      ajustesCents: centavos(1000),
      brutoCents: centavos(13600),
      totalCents: centavos(9600),
      cerradaPorId: "u-duena",
      cerradaPorNombre: "Ana Dueña",
    })

    for (const id of ["l-congelada", "l-pendiente", "l-shampoo", "l-borde-oct"]) {
      expect(lineaGuardada(id).liquidacionId).toBe(guardada.id)
    }
    expect(lineaGuardada("l-pendiente")).toMatchObject({ commissionPercent: 40, commissionCents: 320000, commissionAt: AHORA })
    // Lo que ya estaba congelado no se recalcula.
    expect(lineaGuardada("l-congelada").commissionAt).toEqual(new Date("2026-10-06T15:00:00.000Z"))
    for (const id of ["l-borde-nov", "l-anulada", "l-pedro", "l-duena", "l-abierta", "l-ajena"]) {
      expect(lineaGuardada(id).liquidacionId).toBeNull()
    }
    expect(base.buscar("propinaDeAtencion", { liquidacionId: guardada.id }).map((p) => p.id)).toEqual(["pr-carla"])
    expect(base.buscar("movimientoDeLiquidacion", { liquidacionId: guardada.id }).map((m) => m.id).sort()).toEqual([
      "mv-adelanto",
      "mv-ajuste",
    ])

    // Pide el candado por negocio y miembro.
    expect(base.prisma.$executeRaw).toHaveBeenCalledTimes(1)
    const [partes, ...valores] = base.prisma.$executeRaw.mock.calls[0]
    expect((partes as TemplateStringsArray).join("?")).toContain("pg_advisory_xact_lock")
    expect(valores).toEqual([NEGOCIO, "m-carla"])
  })

  it("una atención incluida queda bloqueada para anular", async () => {
    enSesion(sesiones.dueña)
    await cerrar({ miembroId: "m-carla", desde: "2026-10-01" })
    expect(await atencionBloqueada(base.prisma as unknown as Prisma.TransactionClient, NEGOCIO, "v-pendiente")).toEqual({ motivo: "liquidacion" })
  })

  it("el segundo cierre del mismo período: 409, y nada cambia", async () => {
    enSesion(sesiones.dueña)
    expect((await cerrar({ miembroId: "m-carla", desde: "2026-10-01" })).status).toBe(201)
    const antes = base.volcado()
    const res = await cerrar({ miembroId: "m-carla", desde: "2026-10-01" })
    expect(res.status).toBe(409)
    expect(base.volcado()).toEqual(antes)
  })

  it("dos cierres simultáneos: uno 201 y otro 409", async () => {
    // La base falsa no aísla transacciones. El candado (primera sentencia de
    // la transacción) hace que en Postgres la segunda espere a que termine la
    // primera: se simula poniéndolas en fila.
    const original = base.prisma.$transaction.getMockImplementation()!
    let fila: Promise<unknown> = Promise.resolve()
    const enFila = async (fn: unknown) => {
      const turno = fila.then(() => original(fn))
      fila = turno.catch(() => undefined)
      return turno
    }
    base.prisma.$transaction.mockImplementationOnce(enFila).mockImplementationOnce(enFila)
    enSesion(sesiones.dueña)
    const respuestas = await Promise.all([
      cerrar({ miembroId: "m-carla", desde: "2026-10-01" }),
      cerrar({ miembroId: "m-carla", desde: "2026-10-01" }),
    ])
    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409])
    expect(base.buscar("liquidacion")).toHaveLength(1)
  })

  it.each([
    ["una línea pendiente", "v-pendiente"],
    ["una línea congelada y su propina", "v-congelada"],
  ])("si anulan la atención de %s a mitad del cierre: 409, y nada queda liquidado", async (_, visitId) => {
    // En Postgres la anulación espera el candado del cierre; si igual llega a
    // escribir entre la vista previa y las marcas, el cierre no la toma.
    const crear = base.prisma.liquidacion.create.getMockImplementation()!
    base.prisma.liquidacion.create.mockImplementationOnce(async (args) => {
      await base.prisma.visit.updateMany({ where: { id: visitId }, data: { status: "anulada" } })
      return crear(args)
    })
    enSesion(sesiones.dueña)

    const res = await cerrar({ miembroId: "m-carla", desde: "2026-10-01" })

    expect(res.status).toBe(409)
    expect(base.buscar("liquidacion")).toEqual([])
    expect(base.buscar("visitService").filter((l) => l.liquidacionId !== null && l.liquidacionId !== undefined)).toEqual([])
    expect(base.buscar("propinaDeAtencion").filter((p) => p.liquidacionId)).toEqual([])
  })

  it("una línea no entra en dos liquidaciones: la siguiente es noviembre, con lo de noviembre", async () => {
    enSesion(sesiones.dueña)
    await cerrar({ miembroId: "m-carla", desde: "2026-10-01" })
    const cuerpo = await (await vista()).json()
    expect(cuerpo.periodo).toMatchObject({ desde: "2026-11-01", hasta: "2026-11-30" })
    expect(cuerpo.lineas.map((l: { id: string }) => l.id)).toEqual(["l-borde-nov"])
    expect(cuerpo.propinas.map((p: { id: string }) => p.id)).toEqual(["pr-nov"])
    expect(cuerpo.movimientos.map((m: { id: string }) => m.id)).toEqual(["mv-vale-nov"])
  })

  it("arrastra lo atrasado: lo cobrado en octubre que no entró, entra en noviembre", async () => {
    enSesion(sesiones.dueña)
    await cerrar({ miembroId: "m-carla", desde: "2026-10-01" })
    base.reiniciar({
      ...base.volcado(),
      visit: [...base.volcado().visit, cobrada("v-tarde", "2026-10-15T15:00:00.000Z")],
      visitService: [...base.volcado().visitService, linea("l-tarde", "v-tarde")],
    })
    const cuerpo = await (await vista()).json()
    expect(cuerpo.periodo.desde).toBe("2026-11-01")
    expect(cuerpo.lineas.map((l: { id: string }) => l.id).sort()).toEqual(["l-borde-nov", "l-tarde"])
  })

  it("no cierra con líneas sin %: 409 y no escribe nada", async () => {
    enSesion(sesiones.dueña)
    const antes = base.volcado()
    const res = await cerrar({ miembroId: "m-pedro", desde: "2026-10-01" })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/sin porcentaje/)
    expect(base.volcado()).toEqual(antes)
  })

  it("no cierra con total negativo; dejando afuera el adelanto, sí, y el adelanto queda para la siguiente", async () => {
    base.reiniciar({
      ...escenario(),
      movimientoDeLiquidacion: [movimiento("mv-grande", "adelanto", centavos(50000), "2026-10-10")],
    })
    enSesion(sesiones.dueña)
    const negativo = await cerrar({ miembroId: "m-carla", desde: "2026-10-01" })
    expect(negativo.status).toBe(409)
    expect((await negativo.json()).error).toMatch(/negativo/)
    expect(base.buscar("liquidacion")).toHaveLength(0)

    const res = await cerrar({ miembroId: "m-carla", desde: "2026-10-01", excluirMovimientos: ["mv-grande"] })
    expect(res.status).toBe(201)
    expect((await res.json()).totalCents).toBe(centavos(13600))
    expect(base.buscar("movimientoDeLiquidacion", { id: "mv-grande" })[0].liquidacionId).toBeNull()
  })

  it("un período que todavía no empieza no se cierra", async () => {
    enSesion(sesiones.dueña)
    await cerrar({ miembroId: "m-carla", desde: "2026-10-01" })
    // Cerrado noviembre por adelantado, diciembre todavía no empieza.
    await cerrar({ miembroId: "m-carla", desde: "2026-11-01" })
    const res = await cerrar({ miembroId: "m-carla", desde: "2026-12-01" })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/todavía no empieza/)
  })

  it("con período semanal, el corte es la semana", async () => {
    base.reiniciar({
      ...escenario(),
      business: datosBase().business.map((b) =>
        b.id === NEGOCIO
          ? { ...b, liquidacionPeriodo: "semanal", liquidacionInicioSemana: 1, liquidacionDesde: dia("2026-10-05") }
          : b
      ),
    })
    enSesion(sesiones.dueña)
    const cuerpo = await (await vista()).json()
    // Liquida desde el lunes 5: la semana del lunes 5 al domingo 11.
    expect(cuerpo.periodo).toMatchObject({ tipo: "semanal", desde: "2026-10-05", hasta: "2026-10-11" })
    expect(cuerpo.lineas.map((l: { id: string }) => l.id).sort()).toEqual(["l-congelada", "l-pendiente", "l-shampoo"])
    expect(cuerpo.movimientos.map((m: { id: string }) => m.id)).toEqual(["mv-adelanto"])
  })

  it("solo la dueña cierra: encargado y profesional 401; miembro ajeno 404", async () => {
    for (const sesion of [sesiones.encargado, sesiones.carla]) {
      enSesion(sesion)
      expect((await cerrar({ miembroId: "m-carla", desde: "2026-10-01" })).status).toBe(401)
    }
    enSesion(sesiones.dueña)
    expect((await cerrar({ miembroId: "m-ajeno", desde: "2026-10-01" })).status).toBe(404)
    enSesion(sesiones.dueñoAjeno)
    expect((await cerrar({ miembroId: "m-carla", desde: "2026-10-01" })).status).toBe(404)
    expect(base.buscar("liquidacion")).toHaveLength(0)
  })

  it("cuerpo inválido: 400", async () => {
    enSesion(sesiones.dueña)
    expect((await cerrar({ miembroId: "m-carla", desde: "2026-02-30" })).status).toBe(400)
    expect((await cerrar({ desde: "2026-10-01" })).status).toBe(400)
  })
})

describe("GET /api/liquidaciones y GET /api/liquidaciones/[id]", () => {
  async function conDosLiquidaciones() {
    base.reiniciar({
      ...escenario(),
      businessMember: escenario().businessMember.map((m) => (m.id === "m-pedro" ? { ...m, commissionPercent: 50 } : m)),
    })
    enSesion(sesiones.dueña)
    const carla = await (await cerrar({ miembroId: "m-carla", desde: "2026-10-01" })).json()
    const pedro = await (await cerrar({ miembroId: "m-pedro", desde: "2026-10-01" })).json()
    return { carla: carla.id as string, pedro: pedro.id as string }
  }

  it("la gestión ve todas; el profesional solo las suyas, aunque pida otro miembro", async () => {
    const ids = await conDosLiquidaciones()
    const { GET } = await import("./route")

    enSesion(sesiones.encargado)
    expect((await (await GET(pedido(URL))).json()).map((l: { id: string }) => l.id).sort()).toEqual([ids.carla, ids.pedro].sort())

    enSesion(sesiones.carla)
    expect((await (await GET(pedido(URL))).json()).map((l: { id: string }) => l.id)).toEqual([ids.carla])
    expect(await (await GET(pedido(`${URL}?miembro=m-pedro`))).json()).toEqual([])

    enSesion(sesiones.sinMiembro)
    expect(await (await GET(pedido(URL))).json()).toEqual([])
    enSesion(sesiones.dueñoAjeno)
    expect(await (await GET(pedido(URL))).json()).toEqual([])
  })

  it("el detalle: la propia sí, la ajena 404", async () => {
    const ids = await conDosLiquidaciones()
    const { GET } = await import("./[id]/route")

    enSesion(sesiones.carla)
    const res = await GET(pedido(URL), conId(ids.carla))
    expect(res.status).toBe(200)
    const detalle = await res.json()
    expect(detalle.lineas).toHaveLength(4)
    expect(detalle.totales.totalCents).toBe(centavos(9600))
    expect(detalle.movimientos.map((m: { id: string }) => m.id).sort()).toEqual(["mv-adelanto", "mv-ajuste"])

    expect((await GET(pedido(URL), conId(ids.pedro))).status).toBe(404)
    enSesion(sesiones.dueñoAjeno)
    expect((await GET(pedido(URL), conId(ids.carla))).status).toBe(404)
  })
})

describe("POST /api/liquidaciones/[id]/pago y /anulacion", () => {
  async function cerrada() {
    enSesion(sesiones.dueña)
    return (await (await cerrar({ miembroId: "m-carla", desde: "2026-10-01" })).json()).id as string
  }
  const pagar = async (id: string, cuerpo: unknown = { medio: "transferencia" }) => {
    const { POST } = await import("./[id]/pago/route")
    return POST(pedido(URL, cuerpo), conId(id))
  }
  const anular = async (id: string, cuerpo: unknown = { motivo: "Me equivoqué de adelanto" }) => {
    const { POST } = await import("./[id]/anulacion/route")
    return POST(pedido(URL, cuerpo), conId(id))
  }

  it("marcar pagada registra medio, quién y cuándo; repagar 409", async () => {
    const id = await cerrada()
    const res = await pagar(id)
    expect(res.status).toBe(200)
    expect(base.buscar("liquidacion", { id })[0]).toMatchObject({
      estado: "pagada",
      medioDePago: "transferencia",
      pagadaPorId: "u-duena",
      pagadaPorNombre: "Ana Dueña",
      pagadaAt: AHORA,
    })
    expect((await pagar(id)).status).toBe(409)
  })

  it("pagada no se anula: 409", async () => {
    const id = await cerrada()
    await pagar(id)
    const res = await anular(id)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/ajuste/)
  })

  it("permisos: encargado y la profesional dueña de la liquidación 401; otro profesional y otro negocio 404", async () => {
    const id = await cerrada()
    for (const sesion of [sesiones.encargado, sesiones.carla]) {
      enSesion(sesion)
      expect((await pagar(id)).status).toBe(401)
      expect((await anular(id)).status).toBe(401)
    }
    for (const sesion of [sesiones.pedro, sesiones.dueñoAjeno]) {
      enSesion(sesion)
      expect((await pagar(id)).status).toBe(404)
      expect((await anular(id)).status).toBe(404)
    }
    expect(base.buscar("liquidacion", { id })[0].estado).toBe("cerrada")
  })

  it("medio inexistente o sin motivo: 400", async () => {
    const id = await cerrada()
    expect((await pagar(id, { medio: "trueque" })).status).toBe(400)
    expect((await anular(id, { motivo: "  " })).status).toBe(400)
  })

  it("anular libera lo incluido y el mismo período se puede volver a cerrar", async () => {
    const id = await cerrada()
    const res = await anular(id)
    expect(res.status).toBe(200)
    expect(base.buscar("liquidacion", { id })[0]).toMatchObject({
      estado: "anulada",
      anuladaPorId: "u-duena",
      anuladaPorNombre: "Ana Dueña",
      motivoAnulacion: "Me equivoqué de adelanto",
    })
    expect(base.buscar("visitService", { liquidacionId: id })).toHaveLength(0)
    expect(base.buscar("propinaDeAtencion", { liquidacionId: id })).toHaveLength(0)
    expect(base.buscar("movimientoDeLiquidacion", { liquidacionId: id })).toHaveLength(0)
    // La comisión congelada al cerrar se queda congelada.
    expect(lineaGuardada("l-pendiente")).toMatchObject({ commissionCents: 320000, commissionAt: AHORA })
    expect(await atencionBloqueada(base.prisma as unknown as Prisma.TransactionClient, NEGOCIO, "v-pendiente")).toBeNull()
    expect((await anular(id)).status).toBe(409)

    const otra = await cerrar({ miembroId: "m-carla", desde: "2026-10-01" })
    expect(otra.status).toBe(201)
    expect((await otra.json()).totalCents).toBe(centavos(9600))
  })
})

describe("/api/liquidaciones/configuracion", () => {
  const guardar = async (cuerpo: unknown) => {
    const { PUT } = await import("./configuracion/route")
    return PUT(pedido(`${URL}/configuracion`, cuerpo))
  }

  it("solo la dueña la cambia", async () => {
    for (const sesion of [sesiones.encargado, sesiones.carla]) {
      enSesion(sesion)
      expect((await guardar({ periodo: "semanal", inicioSemana: 0 })).status).toBe(401)
    }
    enSesion(sesiones.dueña)
    expect((await guardar({ periodo: "semanal", inicioSemana: 0 })).status).toBe(200)
    expect(base.buscar("business", { id: NEGOCIO })[0]).toMatchObject({ liquidacionPeriodo: "semanal", liquidacionInicioSemana: 0 })
    expect(base.buscar("business", { id: OTRO_NEGOCIO })[0]).toMatchObject({ liquidacionPeriodo: "mensual" })
  })

  it("valores fuera de lo permitido: 400", async () => {
    enSesion(sesiones.dueña)
    expect((await guardar({ periodo: "diario", inicioSemana: 1 })).status).toBe(400)
    expect((await guardar({ periodo: "semanal", inicioSemana: 7 })).status).toBe(400)
  })

  it("la ve la gestión, no el profesional", async () => {
    const { GET } = await import("./configuracion/route")
    enSesion(sesiones.encargado)
    expect(await (await GET()).json()).toEqual({ periodo: "mensual", inicioSemana: 1 })
    enSesion(sesiones.carla)
    expect((await GET()).status).toBe(401)
  })
})

describe("Liquidar desde", () => {
  const conFecha = (fecha: string | null, extra: Record<string, unknown[]> = {}) => {
    const datos = escenario()
    base.reiniciar({
      ...datos,
      ...extra,
      business: datos.business.map((b) => (b.id === NEGOCIO ? { ...b, liquidacionDesde: fecha ? dia(fecha) : null } : b)),
    })
  }
  const fijar = async (cuerpo: unknown) => {
    const { PUT } = await import("./liquidar-desde/route")
    return PUT(pedido(`${URL}/liquidar-desde`, cuerpo))
  }

  it("sin fecha fijada, vista previa y cierre responden 409 y no escriben nada", async () => {
    conFecha(null)
    enSesion(sesiones.dueña)
    const res = await vista()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/desde qué fecha/)
    const antes = base.volcado()
    expect((await cerrar({ miembroId: "m-carla", desde: "2026-10-01" })).status).toBe(409)
    expect(base.volcado()).toEqual(antes)
  })

  it("lo cobrado antes del borde (en la zona del negocio) no entra, ni bloquea por falta de %", async () => {
    const datos = escenario()
    conFecha("2026-10-07", {
      visit: [
        ...datos.visit,
        // 6 de octubre a las 23:59 en Santiago (UTC-3): antes del borde.
        cobrada("v-antes", "2026-10-07T02:59:00.000Z"),
        // 7 de octubre a las 00:00: ya cuenta.
        cobrada("v-justo", "2026-10-07T03:00:00.000Z"),
      ],
      visitService: [
        ...datos.visitService,
        linea("l-antes", "v-antes"),
        // Producto sin %: antes del borde no frena el cierre.
        lineaDeProducto("l-cera-antes", "v-antes", { productId: "p-cera", serviceName: "Cera" }),
        linea("l-justo", "v-justo"),
      ],
      propinaDeAtencion: [...datos.propinaDeAtencion, propina("pr-antes", "v-antes"), propina("pr-justo", "v-justo")],
      movimientoDeLiquidacion: [
        ...datos.movimientoDeLiquidacion,
        movimiento("mv-antes", "vale", centavos(400), "2026-10-06"),
        movimiento("mv-justo", "vale", centavos(400), "2026-10-07"),
      ],
    })
    enSesion(sesiones.dueña)
    const cuerpo = await (await vista()).json()
    expect(cuerpo.periodo).toMatchObject({ desde: "2026-10-07", hasta: "2026-10-31" })
    const ids = (lista: { id: string }[]) => lista.map((x) => x.id).sort()
    expect(ids(cuerpo.lineas)).toEqual(["l-borde-oct", "l-justo", "l-pendiente", "l-shampoo"])
    expect(ids(cuerpo.propinas)).toEqual(["pr-justo"])
    expect(ids(cuerpo.movimientos)).toEqual(["mv-adelanto", "mv-ajuste", "mv-justo"])
    expect(cuerpo.sinPorcentaje).toBe(0)
    expect(cuerpo.noSePuedeCerrar).toBeNull()

    expect((await cerrar({ miembroId: "m-carla", desde: "2026-10-07" })).status).toBe(201)
    for (const id of ["l-antes", "l-cera-antes", "l-congelada"]) expect(lineaGuardada(id).liquidacionId).toBeNull()
    // Y tampoco entra después: la siguiente es noviembre.
    const siguiente = await (await vista()).json()
    expect(siguiente.periodo.desde).toBe("2026-11-01")
    expect(ids(siguiente.lineas)).toEqual(["l-borde-nov"])
  })

  it("solo la dueña la fija; encargado y profesional 401", async () => {
    conFecha(null)
    for (const sesion of [sesiones.encargado, sesiones.carla, sesiones.sinMiembro]) {
      enSesion(sesion)
      expect((await fijar({ fecha: "2026-10-01" })).status).toBe(401)
    }
    enSesion(sesiones.dueña)
    expect((await fijar({ fecha: "2026-02-30" })).status).toBe(400)
    expect((await fijar({ fecha: "2026-10-01" })).status).toBe(200)
    expect(base.buscar("business", { id: NEGOCIO })[0].liquidacionDesde).toEqual(dia("2026-10-01"))
    expect(base.buscar("business", { id: OTRO_NEGOCIO })[0].liquidacionDesde).toBeNull()
  })

  it("con una liquidación no anulada ya no se cambia (409); anulada, sí", async () => {
    enSesion(sesiones.dueña)
    const { id } = await (await cerrar({ miembroId: "m-carla", desde: "2026-10-01" })).json()
    const res = await fijar({ fecha: "2026-09-01" })
    expect(res.status).toBe(409)
    expect(base.buscar("business", { id: NEGOCIO })[0].liquidacionDesde).toEqual(dia("2026-10-01"))
    // La misma fecha no es un cambio.
    expect((await fijar({ fecha: "2026-10-01" })).status).toBe(200)

    const { POST } = await import("./[id]/anulacion/route")
    await POST(pedido(URL, { motivo: "Otra fecha" }), conId(id))
    expect((await fijar({ fecha: "2026-09-01" })).status).toBe(200)
  })
})
