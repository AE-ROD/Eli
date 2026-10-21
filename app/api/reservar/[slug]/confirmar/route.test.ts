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

/**
 * El día de la semana calculado igual que el endpoint (`new Date(fecha)
 * .getDay()`, zona del servidor). La zona horaria se corrige en otra tarea:
 * acá el test sólo tiene que ver el mismo día que ve el endpoint.
 */
const DIA = new Date(FECHA).getDay()
const OTRO_DIA = (DIA + 1) % 7

const pedidoFalso = (cuerpo: unknown): NextRequest =>
  ({ headers: new Headers(), json: async () => cuerpo }) as unknown as NextRequest

const conSlug = { params: Promise.resolve({ slug: "salon-uno" }) }

const reserva = (hora: string) => ({ servicioId: "s-corte", fecha: FECHA, hora, nombre: "Lucía", apellido: "Pérez" })

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

async function confirmar(hora: string) {
  const { POST } = await import("./route")
  const res = await POST(pedidoFalso(reserva(hora)), conSlug)
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
