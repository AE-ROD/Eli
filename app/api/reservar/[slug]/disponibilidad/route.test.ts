import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { NextRequest } from "next/server"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase } from "@/pruebas/datos"

const mockVerificarLimite = vi.fn()

vi.mock("@/lib/rate-limit", () => ({
  obtenerIp: () => "203.0.113.7",
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
}))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/** Un lunes lejano: nunca es "hoy", así que no se filtran horas pasadas. */
const FECHA = "2030-01-07"

/**
 * Escritos a mano, nunca con la misma cuenta que el endpoint: el 7 de enero
 * de 2030 es lunes, y en enero Santiago (la zona por defecto del negocio)
 * está en UTC-3, así que las 10:00 del negocio son las 13:00 UTC.
 */
const DIA = 1
const OTRO_DIA = 2
function aLas(hora: number): Date {
  return new Date(Date.UTC(2030, 0, 7, hora + 3))
}

const pedidoFalso = (query: string): NextRequest =>
  ({ url: `http://localhost/api/reservar/salon-uno/disponibilidad${query}`, headers: new Headers() }) as unknown as NextRequest

const conSlug = { params: Promise.resolve({ slug: "salon-uno" }) }

const URL_DEL_DIA = `?fecha=${FECHA}&servicioId=s-corte`

type Fila = { memberId?: string | null; startTime: string; endTime: string; dayOfWeek?: number; active?: boolean; businessId?: string }

let siguiente = 1
const franja = ({ memberId = null, dayOfWeek = DIA, businessId = NEGOCIO, ...resto }: Fila) => ({
  id: `h-${siguiente++}`,
  businessId,
  memberId,
  dayOfWeek,
  ...resto,
})

function escenario(horarios: ReturnType<typeof franja>[]) {
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    // Corte de 60 minutos: los turnos caen en horas redondas.
    service: datos.service.map((s) => (s.id === "s-corte" ? { ...s, duration: 60 } : s)),
    workSchedule: horarios,
  })
}

/** Ningún pedido rechazado tiene que llegar a la base. */
function expectSinConsultas() {
  expect(base.prisma.business.findUnique).not.toHaveBeenCalled()
  expect(base.prisma.service.findFirst).not.toHaveBeenCalled()
  expect(base.prisma.workSchedule.findMany).not.toHaveBeenCalled()
  expect(base.prisma.appointment.findMany).not.toHaveBeenCalled()
}

/**
 * El reloj del servidor, fijo: disponibilidad no ofrece fechas pasadas ni a
 * más de 90 días, así que cada grupo fija un "ahora" cerca de las fechas que
 * pide. Sólo se finge `Date`.
 */
function relojEn(instante: string) {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(instante))
}

afterEach(() => {
  vi.useRealTimers()
})

async function horasDelDia() {
  const { GET } = await import("./route")
  const res = await GET(pedidoFalso(URL_DEL_DIA), conSlug)
  expect(res.status).toBe(200)
  return res.json()
}

describe("GET /api/reservar/[slug]/disponibilidad", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Seis días antes del lunes 7 de enero de 2030.
    relojEn("2030-01-01T12:00:00.000Z")
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 59 })
    escenario([franja({ startTime: "09:00", endTime: "12:00" })])
  })

  it("está limitado por IP con el límite de lectura pública: pasado el tope, 429 sin tocar la base", async () => {
    const { GET } = await import("./route")

    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })

    const res = await GET(pedidoFalso(`?fecha=${FECHA}&servicioId=s-corte`), conSlug)

    expect(res.status).toBe(429)
    expect(mockVerificarLimite).toHaveBeenCalledWith("lecturaPublica", "203.0.113.7")
    expectSinConsultas()
  })

  it.each(["cancelada", "no-asistio"])("una cita %s no ocupa: su hora se vuelve a ofrecer", async (status) => {
    const { GET } = await import("./route")
    base.reiniciar({
      ...base.volcado(),
      appointment: [{ id: "cita-1", businessId: NEGOCIO, title: "Corte", status, startTime: aLas(10), endTime: aLas(11) }],
    })

    const res = await GET(pedidoFalso(`?fecha=${FECHA}&servicioId=s-corte`), conSlug)

    expect(await res.json()).toEqual({ slots: ["09:00", "10:00", "11:00"] })
  })

  it("con una fecha y un servicio válidos devuelve las horas libres del día", async () => {
    const { GET } = await import("./route")

    // Ocupada de 10 a 11, hora del negocio.
    base.reiniciar({
      ...base.volcado(),
      appointment: [
        { id: "cita-1", businessId: NEGOCIO, title: "Corte", status: "confirmada", startTime: aLas(10), endTime: aLas(11) },
      ],
    })

    const res = await GET(pedidoFalso(`?fecha=${FECHA}&servicioId=s-corte`), conSlug)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ slots: ["09:00", "11:00"] })
  })

  it.each([
    ["una fecha que no es fecha", "?fecha=xyz&servicioId=s-corte"],
    ["un día que no existe", "?fecha=2026-02-30&servicioId=s-corte"],
    ["un mes que no existe", "?fecha=2026-13-01&servicioId=s-corte"],
    ["una fecha con hora", "?fecha=2030-01-07T10:00:00Z&servicioId=s-corte"],
    ["sin fecha", "?servicioId=s-corte"],
  ])("%s: 400 con un mensaje claro sobre la fecha, sin tocar la base", async (_caso, query) => {
    const { GET } = await import("./route")

    const res = await GET(pedidoFalso(query), conSlug)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toMatch(/fecha/i)
    expect(data.error).toMatch(/AAAA-MM-DD/)
    expectSinConsultas()
  })

  it.each([
    ["sin servicio", `?fecha=${FECHA}`],
    ["un servicio vacío", `?fecha=${FECHA}&servicioId=`],
    ["un servicio que no puede ser un id", `?fecha=${FECHA}&servicioId=${"x".repeat(500)}`],
  ])("%s: 400 con un mensaje claro sobre el servicio, sin tocar la base", async (_caso, query) => {
    const { GET } = await import("./route")

    const res = await GET(pedidoFalso(query), conSlug)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toMatch(/servicio/i)
    expectSinConsultas()
  })
})

describe("GET /api/reservar/[slug]/disponibilidad: de qué horario salen las horas", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    relojEn("2030-01-01T12:00:00.000Z")
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 59 })
  })

  it("con horario general y uno de profesional distintos el mismo día, las horas salen del general", async () => {
    // El del profesional va primero en la tabla: antes, `findFirst` sin filtro
    // de `memberId` ni orden podía tomarlo a él.
    escenario([
      franja({ memberId: "m-carla", startTime: "14:00", endTime: "16:00" }),
      franja({ startTime: "09:00", endTime: "11:00" }),
    ])

    expect(await horasDelDia()).toEqual({ slots: ["09:00", "10:00"] })
  })

  it("sin horario general ese día, las horas salen de la unión de los horarios de los profesionales", async () => {
    escenario([
      franja({ memberId: "m-pedro", startTime: "15:00", endTime: "17:00" }),
      franja({ memberId: "m-carla", startTime: "09:00", endTime: "11:00" }),
      // El general existe, pero para otro día: no cuenta para éste.
      franja({ dayOfWeek: OTRO_DIA, startTime: "08:00", endTime: "20:00" }),
    ])

    expect(await horasDelDia()).toEqual({ slots: ["09:00", "10:00", "15:00", "16:00"] })
  })

  it("con dos franjas generales el mismo día, ofrece las horas de ambas", async () => {
    escenario([
      franja({ startTime: "15:00", endTime: "17:00" }),
      franja({ startTime: "09:00", endTime: "11:00" }),
    ])

    expect(await horasDelDia()).toEqual({ slots: ["09:00", "10:00", "15:00", "16:00"] })
  })

  it("no usa franjas inactivas ni las de otro negocio", async () => {
    escenario([
      franja({ startTime: "09:00", endTime: "11:00", active: false }),
      franja({ businessId: OTRO_NEGOCIO, startTime: "09:00", endTime: "11:00" }),
      franja({ businessId: OTRO_NEGOCIO, memberId: "m-ajeno", startTime: "12:00", endTime: "13:00" }),
    ])

    expect(await horasDelDia()).toEqual({ slots: [], mensaje: "No hay atención ese día" })
  })
})

/**
 * El día de la semana y las horas salen de la zona del negocio, no de la del
 * servidor. Con `new Date("2026-10-19").getDay()` el lunes 19 era domingo en
 * una máquina en Santiago, y con `getHours()` las horas de las citas quedaban
 * corridas en Vercel (UTC). Todo esperado está escrito a mano: la suite corre
 * con TZ=UTC, TZ=America/Santiago y TZ=Asia/Tokyo.
 */
describe("GET /api/reservar/[slug]/disponibilidad: el día y la hora del negocio", () => {
  const LUNES = 1
  const MARTES = 2
  const DOMINGO = 0
  const SABADO = 6
  const VIERNES = 5

  beforeEach(() => {
    vi.clearAllMocks()
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 59 })
    // "Ahora" fijo y lejos de los días pedidos: ninguno es hoy.
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-01T12:00:00.000Z"))
  })

  afterEach(() => vi.useRealTimers())

  async function horasDe(fecha: string) {
    const { GET } = await import("./route")
    const res = await GET(pedidoFalso(`?fecha=${fecha}&servicioId=s-corte`), conSlug)
    expect(res.status).toBe(200)
    return res.json()
  }

  function conCitas(citas: { id: string; startTime: string; endTime: string }[]) {
    base.reiniciar({
      ...base.volcado(),
      appointment: citas.map((c) => ({
        ...c,
        businessId: NEGOCIO,
        title: "Corte",
        status: "confirmada",
        startTime: new Date(c.startTime),
        endTime: new Date(c.endTime),
      })),
    })
  }

  function conZona(zona: string) {
    const volcado = base.volcado()
    base.reiniciar({
      ...volcado,
      business: volcado.business.map((n) => (n.id === NEGOCIO ? { ...n, timezone: zona } : n)),
    })
  }

  it("2026-10-19 es lunes: ofrece la franja del lunes, no la del domingo", async () => {
    escenario([
      franja({ dayOfWeek: DOMINGO, startTime: "15:00", endTime: "17:00" }),
      franja({ dayOfWeek: LUNES, startTime: "09:00", endTime: "12:00" }),
    ])

    expect(await horasDe("2026-10-19")).toEqual({ slots: ["09:00", "10:00", "11:00"] })
  })

  it("2026-10-24 es sábado: ofrece el horario del sábado, no el del viernes", async () => {
    escenario([
      franja({ dayOfWeek: VIERNES, startTime: "09:00", endTime: "19:00" }),
      franja({ dayOfWeek: SABADO, startTime: "10:00", endTime: "12:00" }),
    ])

    expect(await horasDe("2026-10-24")).toEqual({ slots: ["10:00", "11:00"] })
  })

  it("una cita del lunes a las 10:00 del negocio (13:00 UTC) bloquea el lunes 10:00 y no el martes", async () => {
    escenario([
      franja({ dayOfWeek: LUNES, startTime: "09:00", endTime: "12:00" }),
      franja({ dayOfWeek: MARTES, startTime: "09:00", endTime: "12:00" }),
    ])
    conCitas([{ id: "cita-lunes", startTime: "2026-10-19T13:00:00.000Z", endTime: "2026-10-19T14:00:00.000Z" }])

    expect(await horasDe("2026-10-19")).toEqual({ slots: ["09:00", "11:00"] })
    expect(await horasDe("2026-10-20")).toEqual({ slots: ["09:00", "10:00", "11:00"] })
  })

  it("una cita del lunes a las 21:30 del negocio (00:30 UTC del martes) es del lunes", async () => {
    escenario([
      franja({ dayOfWeek: LUNES, startTime: "20:00", endTime: "23:00" }),
      franja({ dayOfWeek: MARTES, startTime: "00:00", endTime: "02:00" }),
    ])
    conCitas([{ id: "cita-noche", startTime: "2026-10-20T00:30:00.000Z", endTime: "2026-10-20T01:30:00.000Z" }])

    expect(await horasDe("2026-10-19")).toEqual({ slots: ["20:00"] })
    expect(await horasDe("2026-10-20")).toEqual({ slots: ["00:00", "01:00"] })
  })

  it("con otra zona guardada (Asia/Tokyo), las 10:00 del negocio son las 01:00 UTC", async () => {
    escenario([franja({ dayOfWeek: LUNES, startTime: "09:00", endTime: "12:00" })])
    conZona("Asia/Tokyo")
    conCitas([{ id: "cita-tokio", startTime: "2026-10-19T01:00:00.000Z", endTime: "2026-10-19T02:00:00.000Z" }])

    expect(await horasDe("2026-10-19")).toEqual({ slots: ["09:00", "11:00"] })
  })

  it("con una zona guardada inválida, usa America/Santiago y no revienta", async () => {
    escenario([franja({ dayOfWeek: LUNES, startTime: "09:00", endTime: "12:00" })])
    conZona("Marte/Olympus")
    conCitas([{ id: "cita-1", startTime: "2026-10-19T13:00:00.000Z", endTime: "2026-10-19T14:00:00.000Z" }])

    expect(await horasDe("2026-10-19")).toEqual({ slots: ["09:00", "11:00"] })
  })

  it("hoy, a las 10:30 del negocio (13:30 UTC), sólo ofrece las horas que no pasaron en su reloj", async () => {
    vi.setSystemTime(new Date("2026-10-19T13:30:00.000Z"))
    escenario([franja({ dayOfWeek: LUNES, startTime: "09:00", endTime: "12:00" })])

    expect(await horasDe("2026-10-19")).toEqual({ slots: ["11:00"] })
  })

  it("a las 23:00 del domingo en el negocio (02:00 UTC del lunes), el lunes todavía no es hoy", async () => {
    vi.setSystemTime(new Date("2026-10-19T02:00:00.000Z"))
    escenario([franja({ dayOfWeek: LUNES, startTime: "09:00", endTime: "12:00" })])

    expect(await horasDe("2026-10-19")).toEqual({ slots: ["09:00", "10:00", "11:00"] })
  })
})

/**
 * Fechas aceptadas: años 1900 a 9998 (lib/zona-horaria.ts). Con `.date()`
 * pasaban 0050 (que `Date.UTC` lee como 1950) o 9999-12-31 (sin día
 * siguiente escribible) y el cálculo del día lanzaba: 500 público.
 */
describe("GET /api/reservar/[slug]/disponibilidad: fechas fuera del rango de años", () => {
  const TODOS_LOS_DIAS = [0, 1, 2, 3, 4, 5, 6]

  beforeEach(() => {
    vi.clearAllMocks()
    // Un mes antes del último día aceptado: así 9998-12-31 cae dentro de los 90 días.
    relojEn("9998-12-01T12:00:00.000Z")
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 59 })
    // Atiende todos los días: si la fecha pasara, habría horas que calcular.
    escenario(TODOS_LOS_DIAS.map((dayOfWeek) => franja({ dayOfWeek, startTime: "09:00", endTime: "11:00" })))
  })

  it.each(["0000-01-01", "0050-06-15", "0999-12-31", "1899-12-31", "9999-12-31"])("%s: 400 con el mensaje de fecha inválida, sin tocar la base", async (fecha) => {
    const { GET } = await import("./route")

    const res = await GET(pedidoFalso(`?fecha=${fecha}&servicioId=s-corte`), conSlug)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toMatch(/fecha/i)
    expect(data.error).toMatch(/AAAA-MM-DD/)
    expectSinConsultas()
  })

  it("9998-12-31 (jueves, último día aceptado): 200 con las horas del jueves", async () => {
    escenario([
      franja({ dayOfWeek: 4, startTime: "09:00", endTime: "11:00" }),
      franja({ dayOfWeek: 5, startTime: "15:00", endTime: "17:00" }),
    ])
    const { GET } = await import("./route")

    const res = await GET(pedidoFalso("?fecha=9998-12-31&servicioId=s-corte"), conSlug)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ slots: ["09:00", "10:00"] })
  })
})

describe("GET /api/reservar/[slug]/disponibilidad: el día del salto del horario de verano", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    relojEn("2026-09-01T12:00:00.000Z")
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 59 })
  })

  it("Santiago, domingo 2026-09-06 (00:00–00:59 no existen): con franja 00:00–02:00 sólo ofrece la 01:00", async () => {
    escenario([franja({ dayOfWeek: 0, startTime: "00:00", endTime: "02:00" })])
    const { GET } = await import("./route")

    const res = await GET(pedidoFalso("?fecha=2026-09-06&servicioId=s-corte"), conSlug)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ slots: ["01:00"] })
  })
})

/**
 * Sólo se ofrecen horas desde ahora hasta 90 días después, en el reloj del
 * negocio (A3), con la misma regla que aplica `confirmar`. Esperados a mano:
 * el 19/10/2026 a las 13:30 UTC son las 10:30 en Santiago; del 1/10/2026 al
 * 30/12/2026 hay 90 días.
 */
describe("GET /api/reservar/[slug]/disponibilidad: ni en el pasado ni a más de 90 días", () => {
  const TODOS_LOS_DIAS = [0, 1, 2, 3, 4, 5, 6]

  beforeEach(() => {
    vi.clearAllMocks()
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 59 })
    escenario(TODOS_LOS_DIAS.map((dayOfWeek) => franja({ dayOfWeek, startTime: "09:00", endTime: "11:00" })))
  })

  async function respuestaDe(fecha: string) {
    const { GET } = await import("./route")
    const res = await GET(pedidoFalso(`?fecha=${fecha}&servicioId=s-corte`), conSlug)
    return { status: res.status, cuerpo: await res.json() }
  }

  it.each([
    ["ayer", "2026-10-18"],
    ["hace años", "2020-01-06"],
  ])("%s: sin horas y con el motivo, sin leer horarios ni citas", async (_caso, fecha) => {
    relojEn("2026-10-19T13:30:00.000Z")

    const { status, cuerpo } = await respuestaDe(fecha)

    expect(status).toBe(200)
    expect(cuerpo.slots).toEqual([])
    expect(cuerpo.mensaje).toMatch(/ya pasó/)
    expect(base.prisma.workSchedule.findMany).not.toHaveBeenCalled()
    expect(base.prisma.appointment.findMany).not.toHaveBeenCalled()
  })

  it("a 90 días justos (30/12/2026): ofrece las horas", async () => {
    relojEn("2026-10-01T12:00:00.000Z")

    expect(await respuestaDe("2026-12-30")).toEqual({ status: 200, cuerpo: { slots: ["09:00", "10:00"] } })
  })

  it.each([
    ["a 91 días", "2026-12-31"],
    ["años después", "2030-01-07"],
  ])("%s: sin horas y con el límite de 90 días, sin leer horarios ni citas", async (_caso, fecha) => {
    relojEn("2026-10-01T12:00:00.000Z")

    const { status, cuerpo } = await respuestaDe(fecha)

    expect(status).toBe(200)
    expect(cuerpo.slots).toEqual([])
    expect(cuerpo.mensaje).toMatch(/90 días/)
    expect(base.prisma.workSchedule.findMany).not.toHaveBeenCalled()
    expect(base.prisma.appointment.findMany).not.toHaveBeenCalled()
  })
})
