import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase } from "@/pruebas/datos"

const mockVerificarLimite = vi.fn()

vi.mock("@/lib/rate-limit", () => ({
  obtenerIp: () => "203.0.113.7",
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
}))

vi.mock("@/lib/email", () => ({
  enviarConfirmacionCliente: vi.fn(async () => null),
  enviarAvisoProfesional: vi.fn(async () => null),
}))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/** Un lunes lejano. */
const FECHA = "2030-01-07"

/** Escritos a mano, nunca con la misma cuenta que el endpoint: el 7 de enero de 2030 es lunes. */
const DIA = 1
const OTRO_DIA = 2

const pedidoFalso = (cuerpo: unknown): NextRequest =>
  ({ headers: new Headers(), json: async () => cuerpo }) as unknown as NextRequest

const conSlug = { params: Promise.resolve({ slug: "salon-uno" }) }

const reserva = (hora: string, fecha = FECHA) => ({ servicioId: "s-corte", fecha, hora, nombre: "Lucía", apellido: "Pérez" })

let siguiente = 1
type Fila = { memberId?: string | null; startTime: string; endTime: string; dayOfWeek?: number; active?: boolean; businessId?: string }
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
    // Corte de 60 minutos.
    service: datos.service.map((s) => (s.id === "s-corte" ? { ...s, duration: 60 } : s)),
    workSchedule: horarios,
  })
}

async function confirmar(hora: string, fecha = FECHA) {
  const { POST } = await import("./route")
  const res = await POST(pedidoFalso(reserva(hora, fecha)), conSlug)
  return { status: res.status, cuerpo: await res.json() }
}

const citasCreadas = () => base.buscar("appointment")

describe("POST /api/reservar/[slug]/confirmar: la hora tiene que caer en el horario de atención", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 9 })
  })

  it("dentro del horario general: crea la cita", async () => {
    escenario([franja({ startTime: "09:00", endTime: "13:00" })])

    const { status, cuerpo } = await confirmar("12:00")

    expect(status).toBe(201)
    expect(cuerpo).toMatchObject({ mensaje: "Reserva confirmada" })
    expect(citasCreadas()).toHaveLength(1)
    expect(citasCreadas()[0]).toMatchObject({ businessId: NEGOCIO, serviceId: "s-corte", status: "pendiente" })
  })

  it.each([
    ["antes de abrir", "08:00"],
    ["empezando dentro pero terminando después del cierre", "12:30"],
    ["después de cerrar", "14:00"],
    ["una hora que no existe", "99:00"],
  ])("fuera del horario (%s): 409 sin crear nada", async (_caso, hora) => {
    escenario([franja({ startTime: "09:00", endTime: "13:00" })])

    const { status, cuerpo } = await confirmar(hora)

    expect(status).toBe(409)
    expect(cuerpo.error).toMatch(/fuera de la atención/)
    expect(citasCreadas()).toHaveLength(0)
    expect(base.buscar("customer", { name: "Lucía" })).toHaveLength(0)
  })

  it("con horario general, una hora que sólo cubre el horario de un profesional se rechaza", async () => {
    escenario([
      franja({ startTime: "09:00", endTime: "13:00" }),
      franja({ memberId: "m-carla", startTime: "15:00", endTime: "19:00" }),
    ])

    expect((await confirmar("16:00")).status).toBe(409)
    expect(citasCreadas()).toHaveLength(0)
  })

  it("sin horario general ese día, vale el de los profesionales", async () => {
    escenario([
      franja({ memberId: "m-carla", startTime: "15:00", endTime: "19:00" }),
      franja({ dayOfWeek: OTRO_DIA, startTime: "09:00", endTime: "13:00" }),
    ])

    expect((await confirmar("16:00")).status).toBe(201)
    expect((await confirmar("10:00")).status).toBe(409)
  })

  it("con dos franjas el mismo día, acepta en la segunda y rechaza en el hueco entre ambas", async () => {
    escenario([
      franja({ startTime: "09:00", endTime: "13:00" }),
      franja({ startTime: "15:00", endTime: "19:00" }),
    ])

    expect((await confirmar("13:30")).status).toBe(409)
    expect((await confirmar("18:00")).status).toBe(201)
  })

  it("un día sin atención: 409", async () => {
    escenario([franja({ dayOfWeek: OTRO_DIA, startTime: "09:00", endTime: "19:00" })])

    expect((await confirmar("10:00")).status).toBe(409)
  })

  it("no cuentan las franjas inactivas ni las de otro negocio", async () => {
    escenario([
      franja({ startTime: "09:00", endTime: "13:00", active: false }),
      franja({ businessId: OTRO_NEGOCIO, startTime: "09:00", endTime: "13:00" }),
    ])

    expect((await confirmar("10:00")).status).toBe(409)
    expect(citasCreadas()).toHaveLength(0)
  })

  it("dentro del horario pero con la hora ocupada: sigue respondiendo el 409 de siempre", async () => {
    escenario([franja({ startTime: "09:00", endTime: "13:00" })])

    expect((await confirmar("10:00")).status).toBe(201)
    const { status, cuerpo } = await confirmar("10:00")

    expect(status).toBe(409)
    expect(cuerpo.error).toBe("El horario ya no está disponible")
    expect(citasCreadas()).toHaveLength(1)
  })
})

/**
 * El día de la semana y el instante de la cita salen de la zona del negocio.
 * Todo esperado está escrito a mano: la suite corre con TZ=UTC,
 * TZ=America/Santiago y TZ=Asia/Tokyo.
 */
describe("POST /api/reservar/[slug]/confirmar: el día y la hora del negocio", () => {
  const LUNES = 1
  const DOMINGO = 0

  beforeEach(() => {
    vi.clearAllMocks()
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 9 })
  })

  function conZona(zona: string) {
    const volcado = base.volcado()
    base.reiniciar({
      ...volcado,
      business: volcado.business.map((n) => (n.id === NEGOCIO ? { ...n, timezone: zona } : n)),
    })
  }

  it("2026-10-19 es lunes: con atención sólo el lunes, acepta", async () => {
    escenario([franja({ dayOfWeek: LUNES, startTime: "09:00", endTime: "13:00" })])

    expect((await confirmar("10:00", "2026-10-19")).status).toBe(201)
  })

  it("2026-10-19 es lunes: con atención sólo el domingo, rechaza", async () => {
    escenario([franja({ dayOfWeek: DOMINGO, startTime: "09:00", endTime: "13:00" })])

    expect((await confirmar("10:00", "2026-10-19")).status).toBe(409)
    expect(citasCreadas()).toHaveLength(0)
  })

  it("guarda la cita en el instante UTC de las 10:00 de Santiago (UTC-3 en octubre)", async () => {
    escenario([franja({ dayOfWeek: LUNES, startTime: "09:00", endTime: "13:00" })])

    expect((await confirmar("10:00", "2026-10-19")).status).toBe(201)

    const [cita] = citasCreadas()
    expect((cita.startTime as Date).toISOString()).toBe("2026-10-19T13:00:00.000Z")
    expect((cita.endTime as Date).toISOString()).toBe("2026-10-19T14:00:00.000Z")
  })

  it("en invierno Santiago está en UTC-4: las 10:00 del 13/7/2026 (lunes) son las 14:00 UTC", async () => {
    escenario([franja({ dayOfWeek: LUNES, startTime: "09:00", endTime: "13:00" })])

    expect((await confirmar("10:00", "2026-07-13")).status).toBe(201)
    expect((citasCreadas()[0].startTime as Date).toISOString()).toBe("2026-07-13T14:00:00.000Z")
  })

  it("con otra zona guardada (Asia/Tokyo), las 10:00 del negocio son las 01:00 UTC", async () => {
    escenario([franja({ dayOfWeek: LUNES, startTime: "09:00", endTime: "13:00" })])
    conZona("Asia/Tokyo")

    expect((await confirmar("10:00", "2026-10-19")).status).toBe(201)
    expect((citasCreadas()[0].startTime as Date).toISOString()).toBe("2026-10-19T01:00:00.000Z")
  })

  it("una cita existente a las 13:00 UTC ocupa las 10:00 del negocio en Santiago", async () => {
    escenario([franja({ dayOfWeek: LUNES, startTime: "09:00", endTime: "13:00" })])
    base.reiniciar({
      ...base.volcado(),
      appointment: [
        {
          id: "cita-1",
          businessId: NEGOCIO,
          title: "Corte",
          status: "confirmada",
          startTime: new Date("2026-10-19T13:00:00.000Z"),
          endTime: new Date("2026-10-19T14:00:00.000Z"),
        },
      ],
    })

    const { status, cuerpo } = await confirmar("10:00", "2026-10-19")
    expect(status).toBe(409)
    expect(cuerpo.error).toBe("El horario ya no está disponible")
    expect((await confirmar("11:00", "2026-10-19")).status).toBe(201)
  })

  it("un día que no existe (2026-02-30): 409 sin crear nada", async () => {
    escenario([franja({ dayOfWeek: LUNES, startTime: "09:00", endTime: "13:00" })])

    expect((await confirmar("10:00", "2026-02-30")).status).toBe(409)
    expect(citasCreadas()).toHaveLength(0)
  })
})
