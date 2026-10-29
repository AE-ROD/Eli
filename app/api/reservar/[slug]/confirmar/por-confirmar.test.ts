import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { NextRequest } from "next/server"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase } from "@/pruebas/datos"
import { MARCA_DE_CLIENTE_ELIMINADO } from "@/lib/clientes-eliminados"

/**
 * Reservas por confirmar tras faltas (#84): si el contacto llega a N "no
 * vino" en el último año en ESTE negocio, la cita nace marcada. La respuesta
 * a quien reserva es idéntica con o sin la marca; sólo cambia el correo.
 */

const mockVerificarLimite = vi.fn()
const mockConfirmacion = vi.fn(async (..._args: unknown[]) => null)
const mockAviso = vi.fn(async (..._args: unknown[]) => null)

vi.mock("@/lib/rate-limit", () => ({
  obtenerIp: () => "203.0.113.7",
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
}))

vi.mock("@/lib/email", () => ({
  enviarConfirmacionCliente: (...args: unknown[]) => mockConfirmacion(...args),
  enviarAvisoProfesional: (...args: unknown[]) => mockAviso(...args),
}))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

/** Lunes 7 de enero de 2030; el reloj, seis días antes. */
const FECHA = "2030-01-07"
const AHORA = new Date("2030-01-01T12:00:00.000Z")
const DIA_MS = 24 * 60 * 60 * 1000
const haceDias = (dias: number) => new Date(AHORA.getTime() - dias * DIA_MS)

const pedidoFalso = (cuerpo: unknown): NextRequest =>
  ({ headers: new Headers(), json: async () => cuerpo }) as unknown as NextRequest

const conSlug = { params: Promise.resolve({ slug: "salon-uno" }) }

interface Contacto {
  email?: string
  telefono?: string
}

const reserva = (hora: string, contacto: Contacto = { email: "lucia@correo.test" }) => ({
  servicioId: "s-corte",
  fecha: FECHA,
  hora,
  nombre: "Lucía",
  apellido: "Pérez",
  ...contacto,
})

let siguiente = 1
/** Una cita "no vino" del cliente, `dias` antes de ahora. */
const falta = (customerId: string, dias: number, businessId = NEGOCIO) => ({
  id: `falta-${siguiente++}`,
  businessId,
  customerId,
  title: "Corte",
  status: "no-asistio",
  startTime: haceDias(dias),
  endTime: new Date(haceDias(dias).getTime() + 60 * 60 * 1000),
})

interface Escenario {
  umbral: number | null
  clientes?: Record<string, unknown>[]
  citas?: Record<string, unknown>[]
}

function escenario({ umbral, clientes = [], citas = [] }: Escenario) {
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    business: datos.business.map((negocio) =>
      negocio.id === NEGOCIO ? { ...negocio, porConfirmarTrasFaltas: umbral } : negocio
    ),
    service: datos.service.map((s) => (s.id === "s-corte" ? { ...s, duration: 60 } : s)),
    customer: [...datos.customer, ...clientes],
    appointment: citas,
    workSchedule: [{ id: "h-1", businessId: NEGOCIO, memberId: null, dayOfWeek: 1, startTime: "09:00", endTime: "18:00" }],
  })
}

/** La que faltó: mismo correo, escrito distinto, y un teléfono con otro formato. */
const faltona = {
  id: "c-faltona",
  businessId: NEGOCIO,
  name: "Lucía",
  lastName: "Pérez",
  email: "  LUCIA@correo.test ",
  phone: "9 8765 4321",
}

async function confirmar(hora: string, contacto?: Contacto) {
  const { POST } = await import("./route")
  const res = await POST(pedidoFalso(reserva(hora, contacto)), conSlug)
  return { status: res.status, cuerpo: await res.json() }
}

const citaCreada = () => base.buscar("appointment", { source: "reserva-publica" })[0]

/** La respuesta sin lo que cambia de una reserva a otra (ids y enlace). */
function forma(cuerpo: Record<string, unknown>) {
  const { citaId, enlaceDeGestion, ...resto } = cuerpo
  return { ...resto, citaId: typeof citaId, enlaceDeGestion: typeof enlaceDeGestion }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 9 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("POST /api/reservar/[slug]/confirmar: reservas por confirmar tras faltas (#84)", () => {
  it("con el umbral alcanzado, la cita nace marcada y pendiente", async () => {
    escenario({ umbral: 2, clientes: [faltona], citas: [falta("c-faltona", 10), falta("c-faltona", 200)] })

    const { status } = await confirmar("10:00")

    expect(status).toBe(201)
    expect(citaCreada()).toMatchObject({ status: "pendiente", confirmacionPorFaltas: true })
  })

  it("debajo del umbral, la cita es normal", async () => {
    escenario({ umbral: 3, clientes: [faltona], citas: [falta("c-faltona", 10), falta("c-faltona", 20)] })

    await confirmar("10:00")

    expect(citaCreada()).toMatchObject({ status: "pendiente", confirmacionPorFaltas: false })
  })

  it("apagado (null), ninguna falta cuenta", async () => {
    escenario({ umbral: null, clientes: [faltona], citas: [falta("c-faltona", 1), falta("c-faltona", 2), falta("c-faltona", 3)] })

    await confirmar("10:00")

    expect(citaCreada().confirmacionPorFaltas).toBe(false)
  })

  it("la respuesta es idéntica con y sin faltas: no revela nada a quien reserva", async () => {
    escenario({ umbral: 1, clientes: [faltona], citas: [falta("c-faltona", 10)] })
    const conFaltas = await confirmar("10:00")
    expect(citaCreada().confirmacionPorFaltas).toBe(true)

    escenario({ umbral: 1 })
    const sinFaltas = await confirmar("10:00")
    expect(citaCreada().confirmacionPorFaltas).toBe(false)

    expect(conFaltas.status).toBe(sinFaltas.status)
    expect(Object.keys(conFaltas.cuerpo).sort()).toEqual(Object.keys(sinFaltas.cuerpo).sort())
    expect(forma(conFaltas.cuerpo)).toEqual(forma(sinFaltas.cuerpo))
    expect(JSON.stringify(conFaltas.cuerpo)).not.toMatch(/falta|confirmar/i)
  })

  it("el correo al cliente sí dice que el local la confirmará; el aviso al negocio también lo marca", async () => {
    escenario({ umbral: 1, clientes: [faltona], citas: [falta("c-faltona", 10)] })
    await confirmar("10:00")
    expect(mockConfirmacion.mock.calls[0][0]).toMatchObject({ porConfirmar: true })
    expect(mockAviso.mock.calls[0][0]).toMatchObject({ porConfirmar: true })

    vi.clearAllMocks()
    escenario({ umbral: 1 })
    await confirmar("10:00")
    expect(mockConfirmacion.mock.calls[0][0]).toMatchObject({ porConfirmar: false })
  })

  it("cuenta por teléfono normalizado aunque el correo sea otro", async () => {
    escenario({ umbral: 1, clientes: [faltona], citas: [falta("c-faltona", 10)] })

    await confirmar("10:00", { email: "otra@correo.test", telefono: "+56987654321" })

    expect(citaCreada().confirmacionPorFaltas).toBe(true)
  })

  it("sin correo ni teléfono no hay faltas que contar", async () => {
    escenario({ umbral: 1, clientes: [faltona], citas: [falta("c-faltona", 10)] })

    await confirmar("10:00", {})

    expect(citaCreada().confirmacionPorFaltas).toBe(false)
  })

  it("sólo cuentan las faltas del último año (365 días)", async () => {
    escenario({ umbral: 2, clientes: [faltona], citas: [falta("c-faltona", 10), falta("c-faltona", 366)] })
    await confirmar("10:00")
    expect(citaCreada().confirmacionPorFaltas).toBe(false)

    escenario({ umbral: 2, clientes: [faltona], citas: [falta("c-faltona", 10), falta("c-faltona", 364)] })
    await confirmar("10:00")
    expect(citaCreada().confirmacionPorFaltas).toBe(true)
  })

  it("sólo cuentan las citas 'no vino': canceladas y completadas no", async () => {
    escenario({
      umbral: 1,
      clientes: [faltona],
      citas: [
        { ...falta("c-faltona", 10), status: "cancelada" },
        { ...falta("c-faltona", 20), status: "completada" },
      ],
    })

    await confirmar("10:00")

    expect(citaCreada().confirmacionPorFaltas).toBe(false)
  })

  it("aislamiento: las faltas del mismo contacto en OTRO negocio no cuentan", async () => {
    const enElOtro = { ...faltona, id: "c-faltona-ajena", businessId: OTRO_NEGOCIO }
    escenario({
      umbral: 1,
      clientes: [enElOtro],
      citas: [falta("c-faltona-ajena", 10, OTRO_NEGOCIO), falta("c-faltona-ajena", 20, OTRO_NEGOCIO)],
    })

    await confirmar("10:00")

    expect(citaCreada()).toMatchObject({ businessId: NEGOCIO, confirmacionPorFaltas: false })
  })

  it("las faltas de un cliente eliminado no cuentan", async () => {
    // Anonimizado, pero con la marca: aunque quedara un dato, no se cuenta.
    const eliminada = { ...faltona, tags: [MARCA_DE_CLIENTE_ELIMINADO] }
    escenario({ umbral: 1, clientes: [eliminada], citas: [falta("c-faltona", 10)] })

    await confirmar("10:00")

    expect(citaCreada().confirmacionPorFaltas).toBe(false)
  })
})
