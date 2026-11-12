import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { NextRequest } from "next/server"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, datosBase } from "@/pruebas/datos"
import { cuerpoDePrueba } from "@/pruebas/pedidos"

/**
 * Lo que lee quien reserva cuando `confirmar` o `disponibilidad` dicen que no
 * habla el rubro del negocio (`Business.type`, de la base, leído por el
 * `slug`): "Motivo no disponible" en una clínica dental, "Esa estilista…" en
 * un salón. Un rubro desconocido o sin rubro conserva los textos de siempre.
 * Los códigos HTTP no cambian con el rubro.
 */

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

/** El lunes 7 de enero de 2030 (escrito a mano); Santiago en enero está en UTC-3. */
const LUNES = "2030-01-07"
const SEMANA_ANTES = "2030-01-01T12:00:00.000Z"

const conSlug = { params: Promise.resolve({ slug: "salon-uno" }) }

/** Un negocio de ese rubro (o sin rubro) que atiende los lunes de 09:00 a 13:00, con un corte de 60 minutos. */
function escenario(rubro: string | undefined) {
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    business: datos.business.map((negocio) => (negocio.id === NEGOCIO ? { ...negocio, type: rubro } : negocio)),
    service: datos.service.map((servicio) => (servicio.id === "s-corte" ? { ...servicio, duration: 60 } : servicio)),
    workSchedule: [{ id: "h-lunes", businessId: NEGOCIO, memberId: null, dayOfWeek: 1, startTime: "09:00", endTime: "13:00" }],
  })
}

const reserva = (extra: Record<string, unknown> = {}) => ({
  servicioId: "s-corte",
  fecha: LUNES,
  hora: "10:00",
  nombre: "Lucía",
  apellido: "Pérez",
  ...extra,
})

async function confirmar(extra: Record<string, unknown> = {}) {
  const { POST } = await import("./confirmar/route")
  const pedido = { headers: new Headers(), body: cuerpoDePrueba(reserva(extra)) } as unknown as NextRequest
  const respuesta = await POST(pedido, conSlug)
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

async function horas(consulta: string) {
  const { GET } = await import("./disponibilidad/route")
  const pedido = { url: `http://localhost/api/reservar/salon-uno/disponibilidad?fecha=${LUNES}&${consulta}`, headers: new Headers() }
  const respuesta = await GET(pedido as unknown as NextRequest, conSlug)
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(SEMANA_ANTES))
  mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 9 })
})

afterEach(() => {
  vi.useRealTimers()
})

/** Cada rubro con lo que dice, y los desconocidos con lo de siempre. */
const POR_RUBRO = [
  {
    rubro: "odontologia",
    servicioNoDisponible: "Motivo no disponible",
    servicioNoEncontrado: "Motivo no encontrado",
    profesionalNoDisponible: "Ese odontólogo no está disponible para este motivo",
    fueraDeLaAtencion: "Ese horario está fuera de la atención de la clínica. Elige otra hora.",
  },
  {
    rubro: "salon",
    servicioNoDisponible: "Servicio no disponible",
    servicioNoEncontrado: "Servicio no encontrado",
    profesionalNoDisponible: "Esa estilista no está disponible para este servicio",
    fueraDeLaAtencion: "Ese horario está fuera de la atención del salón. Elige otra hora.",
  },
  {
    rubro: "barberia",
    servicioNoDisponible: "Servicio no disponible",
    servicioNoEncontrado: "Servicio no encontrado",
    profesionalNoDisponible: "Ese barbero no está disponible para este servicio",
    fueraDeLaAtencion: "Ese horario está fuera de la atención de la barbería. Elige otra hora.",
  },
  {
    rubro: "spa-de-unas",
    servicioNoDisponible: "Servicio no disponible",
    servicioNoEncontrado: "Servicio no encontrado",
    profesionalNoDisponible: "Esa manicurista no está disponible para este servicio",
    fueraDeLaAtencion: "Ese horario está fuera de la atención del salón de uñas. Elige otra hora.",
  },
  ...["salud", "fitness", "otro", "no-existe", undefined].map((rubro) => ({
    rubro,
    servicioNoDisponible: "Servicio no disponible",
    servicioNoEncontrado: "Servicio no encontrado",
    profesionalNoDisponible: "Ese profesional no está disponible para este servicio",
    fueraDeLaAtencion: "Ese horario está fuera de la atención del negocio. Elige otra hora.",
  })),
]

describe.each(POR_RUBRO)("el negocio es de rubro $rubro", (esperado) => {
  beforeEach(() => escenario(esperado.rubro))

  describe("POST confirmar", () => {
    it("un servicio que no existe: 404", async () => {
      const { status, cuerpo } = await confirmar({ servicioId: "no-existe" })

      expect(status).toBe(404)
      expect(cuerpo).toEqual({ error: esperado.servicioNoDisponible })
      expect(base.buscar("appointment")).toHaveLength(0)
    })

    it("un profesional que no es del negocio: 404", async () => {
      const { status, cuerpo } = await confirmar({ profesionalId: "m-ajeno" })

      expect(status).toBe(404)
      expect(cuerpo).toEqual({ error: esperado.profesionalNoDisponible })
      expect(base.buscar("appointment")).toHaveLength(0)
    })

    it("una hora fuera de la atención: 409", async () => {
      const { status, cuerpo } = await confirmar({ hora: "15:00" })

      expect(status).toBe(409)
      expect(cuerpo).toEqual({ error: esperado.fueraDeLaAtencion })
      expect(base.buscar("appointment")).toHaveLength(0)
    })
  })

  describe("GET disponibilidad", () => {
    it("un servicio que no existe: 404", async () => {
      const { status, cuerpo } = await horas("servicioId=no-existe")

      expect(status).toBe(404)
      expect(cuerpo).toEqual({ error: esperado.servicioNoEncontrado })
    })

    it("un profesional que no es del negocio: 404", async () => {
      const { status, cuerpo } = await horas("servicioId=s-corte&profesionalId=m-ajeno")

      expect(status).toBe(404)
      expect(cuerpo).toEqual({ error: esperado.profesionalNoDisponible })
    })
  })
})

describe("el rubro sale de la base, no del pedido", () => {
  it("un navegador que manda su propio rubro no cambia las palabras", async () => {
    escenario("salon")

    const { cuerpo } = await confirmar({ servicioId: "no-existe", rubro: "odontologia", type: "odontologia" })

    expect(cuerpo).toEqual({ error: "Servicio no disponible" })
  })
})

/**
 * Los topes anti-abuso. 429 con las palabras del negocio: "…en esta clínica…
 * contáctala" / "…en este salón… contáctalo" / "…en este negocio… contáctalo".
 */
describe("los topes de la reserva pública hablan el rubro del negocio", () => {
  const AHORA = "2026-10-01T12:00:00.000Z"
  const CONTACTO = "Lucía"

  let numero = 1
  /** Una reserva pública futura, pendiente, de Lucía. */
  const cita = (datos: Record<string, unknown> = {}) => ({
    id: `cita-tope-${numero++}`,
    businessId: NEGOCIO,
    customerId: "c-lucia",
    serviceId: "s-corte",
    source: "reserva-publica",
    title: "Corte",
    status: "pendiente",
    startTime: new Date("2026-10-20T13:00:00.000Z"),
    endTime: new Date("2026-10-20T14:00:00.000Z"),
    createdAt: new Date("2026-09-01T12:00:00.000Z"),
    ...datos,
  })

  function conCitas(rubro: string | undefined, citas: Record<string, unknown>[]) {
    escenario(rubro)
    const volcado = base.volcado()
    base.reiniciar({
      ...volcado,
      workSchedule: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
        id: `h-${dayOfWeek}`,
        businessId: NEGOCIO,
        memberId: null,
        dayOfWeek,
        startTime: "09:00",
        endTime: "13:00",
      })),
      customer: [
        ...volcado.customer,
        { id: "c-lucia", businessId: NEGOCIO, name: CONTACTO, lastName: "Pérez", email: "lucia@correo.test", phone: "+56 9 1234 5678" },
      ],
      appointment: citas,
    })
  }

  const reservar = () => confirmar({ fecha: "2026-10-15", hora: "10:00", email: "lucia@correo.test" })

  beforeEach(() => vi.setSystemTime(new Date(AHORA)))

  it.each([
    ["odontologia", "Ya tienes 3 reservas pendientes en esta clínica. Para pedir otra, contáctala directamente."],
    ["salon", "Ya tienes 3 reservas pendientes en este salón. Para pedir otra, contáctalo directamente."],
    ["barberia", "Ya tienes 3 reservas pendientes en esta barbería. Para pedir otra, contáctala directamente."],
    ["spa-de-unas", "Ya tienes 3 reservas pendientes en este salón de uñas. Para pedir otra, contáctalo directamente."],
    ["salud", "Ya tienes 3 reservas pendientes en este negocio. Para pedir otra, contáctalo directamente."],
    [undefined, "Ya tienes 3 reservas pendientes en este negocio. Para pedir otra, contáctalo directamente."],
  ])("por contacto, rubro %s: 429", async (rubro, mensaje) => {
    conCitas(rubro, [cita(), cita(), cita()])

    const { status, cuerpo } = await reservar()

    expect(status).toBe(429)
    expect(cuerpo).toEqual({ error: mensaje })
    expect(base.buscar("appointment")).toHaveLength(3)
  })

  it.each([
    ["odontologia", "Esta clínica recibió demasiadas reservas en línea en las últimas horas. Intenta más tarde o contáctala directamente."],
    ["salon", "Este salón recibió demasiadas reservas en línea en las últimas horas. Intenta más tarde o contáctalo directamente."],
    ["barberia", "Esta barbería recibió demasiadas reservas en línea en las últimas horas. Intenta más tarde o contáctala directamente."],
    ["salud", "Este negocio recibió demasiadas reservas en línea en las últimas horas. Intenta más tarde o contáctalo directamente."],
    [undefined, "Este negocio recibió demasiadas reservas en línea en las últimas horas. Intenta más tarde o contáctalo directamente."],
  ])("por negocio, rubro %s: 429", async (rubro, mensaje) => {
    const reciente = new Date(new Date(AHORA).getTime() - 23 * 3_600_000)
    // Citas de otras personas: sólo cuenta cuántas recibió el negocio.
    conCitas(rubro, Array.from({ length: 50 }, () => cita({ customerId: "c-maria", createdAt: reciente })))

    const { status, cuerpo } = await reservar()

    expect(status).toBe(429)
    expect(cuerpo).toEqual({ error: mensaje })
    expect(base.buscar("appointment")).toHaveLength(50)
  })
})
