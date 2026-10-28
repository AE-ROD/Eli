import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, atencion, centavos, datosBase, linea, lineaDeLaDueña, propina, sesiones } from "@/pruebas/datos"

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/** Miércoles 21 de octubre de 2026, mediodía en Santiago (UTC-3). Semana del lunes 19 al domingo 25. */
const AHORA = new Date("2026-10-21T15:00:00.000Z")

const enSesion = (sesion: unknown) => mockGetServerSession.mockResolvedValue(sesion)
const cobrada = (id: string, paidAt: string, datos: Record<string, unknown> = {}) =>
  atencion(id, { status: "finalizada", paidAt: new Date(paidAt), ...datos })
const congelada = (cents: number) => ({ commissionPercent: 10, commissionCents: cents, commissionAt: new Date("2026-10-01T00:00:00.000Z") })

function liquidacion(id: string, memberId: string, memberName: string) {
  return {
    id,
    businessId: NEGOCIO,
    memberId,
    memberName,
    periodo: "mensual",
    desde: new Date("2026-09-01T00:00:00.000Z"),
    hasta: new Date("2026-09-30T00:00:00.000Z"),
    zona: "America/Santiago",
    comisionServiciosCents: 0,
    comisionProductosCents: 0,
    propinasCents: 0,
    adelantosCents: 0,
    ajustesCents: 0,
    brutoCents: 0,
    totalCents: centavos(77777),
    cerradaPorId: "u-duena",
    cerradaPorNombre: "Ana Dueña",
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  base.reiniciar({
    ...datosBase(),
    visit: [
      cobrada("v-hoy", "2026-10-21T13:00:00.000Z"),
      cobrada("v-lunes", "2026-10-20T01:00:00.000Z"), // lunes 19 a las 22:00 en Santiago
      cobrada("v-domingo", "2026-10-19T02:30:00.000Z"), // domingo 18 a las 23:30: fuera de la semana
      cobrada("v-septiembre", "2026-10-01T02:00:00.000Z"), // 30 de septiembre a las 23:00
      atencion("v-anulada", { status: "anulada", paidAt: new Date("2026-10-21T13:00:00.000Z") }),
      cobrada("v-ajena", "2026-10-21T13:00:00.000Z", { businessId: OTRO_NEGOCIO, customerId: "c-ajeno" }),
    ],
    visitService: [
      linea("l-hoy", "v-hoy", congelada(centavos(3200))),
      linea("l-hoy-pendiente", "v-hoy", { serviceId: "s-color", serviceName: "Color", priceCents: centavos(25000) }),
      linea("l-hoy-pedro", "v-hoy", { memberId: "m-pedro", professionalName: "Pedro Profesional", ...congelada(centavos(9999)) }),
      lineaDeLaDueña("l-hoy-duena", "v-hoy", { priceCents: centavos(40000) }),
      linea("l-lunes", "v-lunes", congelada(centavos(1000))),
      linea("l-domingo", "v-domingo", congelada(centavos(500))),
      linea("l-septiembre", "v-septiembre", congelada(centavos(300))),
      linea("l-anulada", "v-anulada", congelada(centavos(4444))),
      linea("l-ajena", "v-ajena", { memberId: "m-ajeno", serviceId: "s-ajeno", ...congelada(centavos(8888)) }),
    ],
    propinaDeAtencion: [
      propina("pr-hoy", "v-hoy"),
      propina("pr-pedro", "v-hoy", { memberId: "m-pedro", professionalName: "Pedro Profesional", amountCents: centavos(700) }),
      propina("pr-anulada", "v-anulada", { amountCents: centavos(6000) }),
    ],
    liquidacion: [liquidacion("liq-carla", "m-carla", "Carla Profesional"), liquidacion("liq-pedro", "m-pedro", "Pedro Profesional")],
    movimientoDeLiquidacion: [
      {
        id: "mv-carla",
        businessId: NEGOCIO,
        memberId: "m-carla",
        memberName: "Carla Profesional",
        tipo: "adelanto",
        montoCents: centavos(5000),
        fecha: new Date("2026-10-15T00:00:00.000Z"),
        createdById: "u-duena",
        createdByName: "Ana Dueña",
      },
      {
        id: "mv-ajuste",
        businessId: NEGOCIO,
        memberId: "m-carla",
        memberName: "Carla Profesional",
        tipo: "ajuste",
        montoCents: centavos(100),
        motivo: "x",
        fecha: new Date("2026-10-15T00:00:00.000Z"),
        createdById: "u-duena",
        createdByName: "Ana Dueña",
      },
      {
        id: "mv-pedro",
        businessId: NEGOCIO,
        memberId: "m-pedro",
        memberName: "Pedro Profesional",
        tipo: "vale",
        montoCents: centavos(1234),
        fecha: new Date("2026-10-15T00:00:00.000Z"),
        createdById: "u-duena",
        createdByName: "Ana Dueña",
      },
    ],
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("GET /api/mi-plata", () => {
  it("hoy, semana y período en la zona del negocio, sólo con lo de Carla", async () => {
    const { GET } = await import("./route")
    enSesion(sesiones.carla)
    const res = await GET()
    expect(res.status).toBe(200)
    const plata = await res.json()

    expect(plata.nombre).toBe("Carla Profesional")
    expect(plata.hoy).toEqual({ fecha: "2026-10-21", comisionesCents: centavos(3200), propinasCents: centavos(2000), totalCents: centavos(5200) })
    expect(plata.semana).toMatchObject({ desde: "2026-10-19", hasta: "2026-10-25", comisionesCents: centavos(4200), totalCents: centavos(6200) })
    expect(plata.periodo).toMatchObject({
      tipo: "mensual",
      desde: "2026-10-01",
      hasta: "2026-10-31",
      comisionesCents: centavos(4700),
      propinasCents: centavos(2000),
    })
    expect(plata.esperanPorcentaje).toBe(1)
    expect(plata.adelantos).toEqual({
      totalCents: centavos(5000),
      lista: [{ id: "mv-carla", tipo: "adelanto", montoCents: centavos(5000), fecha: "2026-10-15", motivo: null }],
    })
    expect(plata.liquidaciones.map((l: { id: string }) => l.id)).toEqual(["liq-carla"])
  })

  it("no expone nada ajeno: ni montos de otros, ni pagos, ni totales del negocio", async () => {
    const { GET } = await import("./route")
    enSesion(sesiones.carla)
    const texto = await (await GET()).text()
    for (const ajeno of ["Pedro", "m-pedro", "payments", "pagos"]) expect(texto).not.toContain(ajeno)
    // Ningún monto de Pedro, de la dueña, de lo anulado ni del total de la atención.
    const montos = [...texto.matchAll(/:(-?\d+)[,}]/g)].map((m) => Number(m[1]))
    for (const ajeno of [centavos(9999), centavos(700), centavos(1234), centavos(40000), centavos(4444), centavos(6000), centavos(33000)]) {
      expect(montos).not.toContain(ajeno)
    }
  })

  it("con la semana desde el domingo, el domingo 18 entra", async () => {
    base.reiniciar({
      ...base.volcado(),
      business: base.volcado().business.map((b) => (b.id === NEGOCIO ? { ...b, liquidacionInicioSemana: 0, liquidacionPeriodo: "semanal" } : b)),
    })
    const { GET } = await import("./route")
    enSesion(sesiones.carla)
    const plata = await (await GET()).json()
    expect(plata.semana).toMatchObject({ desde: "2026-10-18", hasta: "2026-10-24", comisionesCents: centavos(4700) })
    expect(plata.periodo).toMatchObject({ tipo: "semanal", desde: "2026-10-18", hasta: "2026-10-24" })
  })

  it("cada profesional ve lo suyo; la dueña y quien no tiene memberId: 401", async () => {
    const { GET } = await import("./route")
    enSesion(sesiones.pedro)
    const pedro = await (await GET()).json()
    expect(pedro.hoy.totalCents).toBe(centavos(9999 + 700))
    expect(pedro.adelantos.totalCents).toBe(centavos(1234))
    expect(pedro.liquidaciones.map((l: { id: string }) => l.id)).toEqual(["liq-pedro"])

    for (const sesion of [sesiones.dueña, sesiones.sinMiembro, sesiones.dueñoAjeno, null]) {
      enSesion(sesion)
      expect((await GET()).status).toBe(401)
    }
  })

  it("un memberId que no es del negocio de la sesión: 401", async () => {
    const { GET } = await import("./route")
    enSesion({ user: { ...sesiones.carla.user, memberId: "m-ajeno" } })
    expect((await GET()).status).toBe(401)
  })
})
