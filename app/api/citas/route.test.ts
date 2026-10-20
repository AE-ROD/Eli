import { describe, it, expect, vi, beforeEach } from "vitest"
import { coincideConWhere } from "@/pruebas/where-simple"
import type { NextRequest } from "next/server"
import { whereDeAgenda, type Actor } from "@/lib/permisos"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const citasFake = [
  { id: "cita-mia", businessId: "negocio-1", memberId: "member-worker-1", customerId: "c-1" },
  { id: "cita-colega", businessId: "negocio-1", memberId: "member-colega", customerId: "c-2" },
]

const prismaMock = {
  appointment: {
    findMany: vi.fn((args: { where: Record<string, unknown> }) =>
      Promise.resolve(citasFake.filter((c) => coincideConWhere(c, args.where)))
    ),
    create: vi.fn((args: { data: Record<string, unknown> }) => Promise.resolve({ id: "cita-nueva", ...args.data })),
  },
  customer: { findFirst: vi.fn() },
  businessMember: { findFirst: vi.fn() },
  business: {
    findUnique: vi.fn((_args: { where: { id: string } }) => Promise.resolve({ timezone: zonaDelNegocio })),
  },
}

/** La zona guardada del negocio del actor en cada test (`Business.timezone`). */
let zonaDelNegocio = "America/Santiago"

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

const sesionDueño = {
  user: { id: "owner-1", role: "owner", businessId: "negocio-1", businessName: "Mi negocio" },
}

const sesionProfesional = {
  user: {
    id: "worker-1",
    role: "worker",
    businessId: "negocio-1",
    businessName: "Mi negocio",
    memberId: "member-worker-1",
  },
}

const pedidoFalso = (url: string): NextRequest => ({ url } as unknown as NextRequest)

describe("GET /api/citas", () => {
  beforeEach(() => vi.clearAllMocks())

  it("un worker no ve la cita de un colega, sólo la suya", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await GET(pedidoFalso("http://localhost/api/citas"))
    const data = await res.json()

    expect(data).toHaveLength(1)
    expect(data[0].id).toBe("cita-mia")
  })

  it("el dueño ve las citas de todo el negocio, las dos", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const res = await GET(pedidoFalso("http://localhost/api/citas"))
    const data = await res.json()

    expect(data).toHaveLength(2)
    expect(data.map((c: { id: string }) => c.id).sort()).toEqual(["cita-colega", "cita-mia"])
  })

  // `route.ts` no expone hoy un query param que produzca un `extra` con
  // `memberId` o `AND` propios (sólo `customerId` y rango de fechas), así que
  // estos dos casos no se pueden disparar armando una URL: se prueba
  // directamente `whereDeAgenda` — la misma función que usa el endpoint —
  // contra `citasFake`, reusando `coincideConWhere`. Es justo la combinación que
  // rompía con `{ ...filtroDeAgenda(actor), ...extra }`.
  const workerConMember: Actor = { rol: "worker", businessId: "negocio-1", memberId: "member-worker-1" }
  const workerSinMember: Actor = { rol: "worker", businessId: "negocio-1", memberId: null }

  it("worker con memberId: un extra con memberId de un colega no le abre su cita (antes sí, pisaba el filtro)", () => {
    const where = whereDeAgenda(workerConMember, { memberId: "member-colega" })

    expect(citasFake.filter((c) => coincideConWhere(c, where))).toHaveLength(0)
  })

  it("worker sin memberId: un extra con su propio AND no destapa todas las del negocio (bug de F-002)", () => {
    const where = whereDeAgenda(workerSinMember, { AND: [{ businessId: "negocio-1" }] })

    expect(citasFake.filter((c) => coincideConWhere(c, where))).toHaveLength(0)
  })

  it("sin sesión recibe 401", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await GET(pedidoFalso("http://localhost/api/citas"))

    expect(res.status).toBe(401)
    expect(prismaMock.appointment.findMany).not.toHaveBeenCalled()
  })
})

/**
 * `?fecha=` y `?desde=&hasta=` son días calendario del negocio. Los
 * instantes esperados están escritos a mano (Santiago en octubre es UTC-3,
 * Tokio UTC+9): la suite corre con TZ=UTC, TZ=America/Santiago y
 * TZ=Asia/Tokyo.
 */
describe("GET /api/citas: el día pedido es el del negocio", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    zonaDelNegocio = "America/Santiago"
  })

  const citasDeLaSemana = [
    // Domingo 18, 23:30 en Santiago (02:30 UTC del lunes).
    { id: "domingo-noche", businessId: "negocio-1", startTime: new Date("2026-10-19T02:30:00.000Z") },
    // Lunes 19, 00:30 en Santiago.
    { id: "lunes-temprano", businessId: "negocio-1", startTime: new Date("2026-10-19T03:30:00.000Z") },
    // Lunes 19, 22:00 en Santiago (01:00 UTC del martes).
    { id: "lunes-noche", businessId: "negocio-1", startTime: new Date("2026-10-20T01:00:00.000Z") },
    // Martes 20, 10:00 en Santiago.
    { id: "martes", businessId: "negocio-1", startTime: new Date("2026-10-20T13:00:00.000Z") },
  ]

  type Rango = { gte: Date; lt: Date }

  /** El rango de `startTime` dentro del `{ AND: [filtroDeAgenda, extra] }` de `whereDeAgenda`. */
  function rangoDe(where: Record<string, unknown>): Rango | undefined {
    const partes = (where.AND as Record<string, unknown>[] | undefined) ?? []
    return partes.map((parte) => parte.startTime as Rango | undefined).find(Boolean)
  }

  /** Lo que la base devolvería con el rango que arma el endpoint. */
  function conCitasDeLaSemana() {
    prismaMock.appointment.findMany.mockImplementationOnce((args: { where: Record<string, unknown> }) => {
      const rango = rangoDe(args.where)
      return Promise.resolve(
        citasDeLaSemana.filter((c) => !rango || (c.startTime >= rango.gte && c.startTime < rango.lt)) as never
      )
    })
  }

  const rangoPedido = (): Rango =>
    rangoDe((prismaMock.appointment.findMany.mock.calls[0][0] as { where: Record<string, unknown> }).where)!

  async function pedir(query: string) {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    return GET(pedidoFalso(`http://localhost/api/citas${query}`))
  }

  it("?fecha=2026-10-19 devuelve las del lunes 19 en Santiago, no las del domingo ni las del martes", async () => {
    conCitasDeLaSemana()

    const res = await pedir("?fecha=2026-10-19")
    const data = await res.json()

    expect(rangoPedido().gte.toISOString()).toBe("2026-10-19T03:00:00.000Z")
    expect(rangoPedido().lt.toISOString()).toBe("2026-10-20T03:00:00.000Z")
    expect(data.map((c: { id: string }) => c.id)).toEqual(["lunes-temprano", "lunes-noche"])
  })

  it("la zona se lee del negocio del actor, no de un parámetro", async () => {
    conCitasDeLaSemana()

    await pedir("?fecha=2026-10-19")

    expect(prismaMock.business.findUnique).toHaveBeenCalledWith({
      where: { id: "negocio-1" },
      select: { timezone: true },
    })
  })

  it("?desde=2026-10-19&hasta=2026-10-20 cubre del lunes a las 00:00 al miércoles a las 00:00, en Santiago", async () => {
    conCitasDeLaSemana()

    const data = await (await pedir("?desde=2026-10-19&hasta=2026-10-20")).json()

    expect(rangoPedido().gte.toISOString()).toBe("2026-10-19T03:00:00.000Z")
    expect(rangoPedido().lt.toISOString()).toBe("2026-10-21T03:00:00.000Z")
    expect(data.map((c: { id: string }) => c.id)).toEqual(["lunes-temprano", "lunes-noche", "martes"])
  })

  it("con otra zona guardada (Asia/Tokyo), el lunes 19 va de las 15:00 UTC del domingo a las 15:00 UTC del lunes", async () => {
    zonaDelNegocio = "Asia/Tokyo"
    conCitasDeLaSemana()

    await pedir("?fecha=2026-10-19")

    expect(rangoPedido().gte.toISOString()).toBe("2026-10-18T15:00:00.000Z")
    expect(rangoPedido().lt.toISOString()).toBe("2026-10-19T15:00:00.000Z")
  })

  it("?fecha=9998-12-31, el último día aceptado: de 9998-12-31T03:00Z a 9999-01-01T03:00Z", async () => {
    conCitasDeLaSemana()

    const res = await pedir("?fecha=9998-12-31")

    expect(res.status).toBe(200)
    expect(rangoPedido().gte.toISOString()).toBe("9998-12-31T03:00:00.000Z")
    expect(rangoPedido().lt.toISOString()).toBe("9999-01-01T03:00:00.000Z")
  })

  it("con una zona guardada inválida, usa America/Santiago", async () => {
    zonaDelNegocio = "Marte/Olympus"
    conCitasDeLaSemana()

    await pedir("?fecha=2026-10-19")

    expect(rangoPedido().gte.toISOString()).toBe("2026-10-19T03:00:00.000Z")
  })

  it.each([
    "?fecha=xyz",
    "?fecha=2026-02-30",
    "?desde=2026-10-19&hasta=nada",
    // Fuera del rango de años aceptado (1900 a 9998, lib/zona-horaria.ts).
    "?fecha=0000-01-01",
    "?fecha=0050-06-15",
    "?fecha=0999-12-31",
    "?fecha=1899-12-31",
    "?fecha=9999-12-31",
    "?desde=2026-10-19&hasta=9999-12-31",
    "?desde=0050-06-15&hasta=2026-10-19",
  ])(
    "%s: 400 sin consultar citas",
    async (query) => {
      const res = await pedir(query)

      expect(res.status).toBe(400)
      expect((await res.json()).error).toMatch(/AAAA-MM-DD/)
      expect(prismaMock.appointment.findMany).not.toHaveBeenCalled()
    }
  )
})

describe("POST /api/citas — largos, tipos y horario", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.customer.findFirst.mockResolvedValue({ id: "c-1", businessId: "negocio-1" })
  })

  const citaValida = {
    title: "Corte",
    startTime: "2026-10-20T13:00:00.000Z",
    endTime: "2026-10-20T13:30:00.000Z",
    customerId: "c-1",
  }

  const crear = async (cuerpo: Record<string, unknown>) => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    return POST({ url: "http://localhost/api/citas", json: () => Promise.resolve(cuerpo) } as unknown as NextRequest)
  }

  it.each([
    ["un título de 121 caracteres", { title: "a".repeat(121) }, "El título no puede tener más de 120 caracteres"],
    ["unas notas de 2001 caracteres", { notes: "a".repeat(2001) }, "Las notas no pueden tener más de 2000 caracteres"],
    ["un precio de 0", { price: 0 }, "El precio tiene que ser mayor que 0"],
    ["un precio negativo", { price: -5 }, "El precio tiene que ser mayor que 0"],
    ["un precio de más de 10.000.000", { price: 10_000_001 }, "El precio no puede ser mayor que 10.000.000"],
    ["un fin igual al inicio", { endTime: "2026-10-20T13:00:00.000Z" }, "La cita tiene que terminar después de empezar"],
    ["un fin antes del inicio", { endTime: "2026-10-20T12:00:00.000Z" }, "La cita tiene que terminar después de empezar"],
    ["una fecha que no es fecha", { startTime: "mañana" }, "La fecha de inicio no es válida"],
  ])("rechaza %s: 400 con un error legible, sin `detalles`, y no crea nada", async (_caso, campos, mensaje) => {
    const res = await crear({ ...citaValida, ...campos })

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: mensaje })
    expect(prismaMock.appointment.create).not.toHaveBeenCalled()
  })

  it("acepta los bordes: título de 120, notas de 2000 y precio de 10.000.000", async () => {
    const res = await crear({ ...citaValida, title: "a".repeat(120), notes: "a".repeat(2000), price: 10_000_000 })

    expect(res.status).toBe(201)
    expect(prismaMock.appointment.create).toHaveBeenCalled()
  })
})
