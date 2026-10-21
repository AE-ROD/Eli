import { describe, it, expect, vi, beforeEach } from "vitest"
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
 * El día de la semana y las horas del día, calculados igual que el endpoint
 * (`new Date(fecha).getDay()` y `setHours` en la zona del servidor). El
 * cálculo de zona horaria se corrige en otra tarea; acá el test sólo tiene que
 * ver el mismo día que ve el endpoint, corra donde corra.
 */
const DIA = new Date(FECHA).getDay()
const OTRO_DIA = (DIA + 1) % 7
function aLas(hora: number): Date {
  const instante = new Date(FECHA)
  instante.setHours(hora, 0, 0, 0)
  return instante
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

async function horasDelDia() {
  const { GET } = await import("./route")
  const res = await GET(pedidoFalso(URL_DEL_DIA), conSlug)
  expect(res.status).toBe(200)
  return res.json()
}

describe("GET /api/reservar/[slug]/disponibilidad", () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  it("con una fecha y un servicio válidos devuelve las horas libres del día", async () => {
    const { GET } = await import("./route")

    // Ocupada de 10 a 11 (hora del servidor, igual que la cuenta de los turnos).
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
