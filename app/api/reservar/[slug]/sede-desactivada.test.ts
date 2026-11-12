import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest"
import type { NextRequest } from "next/server"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, datosBase } from "@/pruebas/datos"
import { cuerpoDePrueba } from "@/pruebas/pedidos"
import { enviarAvisoProfesional, enviarConfirmacionCliente } from "@/lib/email"
import { MENSAJE_SEDE_YA_NO_DISPONIBLE } from "@/lib/rechazo-de-sede-inactiva"

/**
 * La reserva pública y la lista de espera cuando la dueña desactiva la sede
 * MIENTRAS el cliente reserva (etapa 9, plan Independiente). La aplicación lee
 * las sedes activas fuera de la transacción que crea la cita: entre una cosa y
 * la otra la sede puede desactivarse. Quien lo ataja es el trigger de la base
 * (`citas_exigen_sede_activa`, `lista_de_espera_exige_sede_activa`, bajo el
 * candado del negocio), y la ruta lo responde con un 409 claro y sin guardar
 * nada: ni la cita, ni el cliente, ni correos.
 *
 * Cada test simula la carrera con la misma secuencia: la ruta lee las sedes
 * (activas) y revisa el horario; justo antes de escribir, la dueña desactiva
 * una; la escritura ve la sede inactiva.
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

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = "secreto-de-prueba-de-la-sede-desactivada"
})

/** El lunes 7 de enero de 2030; Santiago en enero está en UTC-3. */
const LUNES = "2030-01-07"
const aLas = (hora: string) => new Date(`${LUNES}T${hora}:00.000-03:00`)

const CENTRO = "sede-centro"
const PROVIDENCIA = "sede-providencia"

type Registro = Record<string, unknown>

const sede = (id: string, nombre: string, orden: number) => ({
  id,
  businessId: NEGOCIO,
  nombre,
  direccion: `Calle ${nombre} 123`,
  comuna: "Santiago",
  orden,
})
const franja = (id: string, sedeId: string, startTime: string, endTime: string) => ({
  id,
  businessId: NEGOCIO,
  memberId: null,
  sedeId,
  dayOfWeek: 1,
  startTime,
  endTime,
})

/** Negocio Independiente con dos sedes activas (Centro de mañana, Providencia de tarde). Corte de 60 minutos. */
function escenario(citas: Registro[] = []) {
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    business: datos.business.map((negocio) => ({ ...negocio, plan: "independiente", listaDeEsperaActiva: true })),
    businessMember: [],
    service: datos.service.map((servicio) => (servicio.id === "s-corte" ? { ...servicio, duration: 60 } : servicio)),
    sede: [sede(CENTRO, "Centro", 0), sede(PROVIDENCIA, "Providencia", 1)],
    workSchedule: [franja("h-centro", CENTRO, "09:00", "12:00"), franja("h-prov", PROVIDENCIA, "14:00", "18:00")],
    appointment: citas,
    inscripcionEnEspera: [],
  })
}

/**
 * La dueña desactiva la sede justo ANTES de que la ruta abra la transacción que
 * escribe: la ruta ya leyó las sedes activas y revisó el horario (todo eso
 * pasó con la sede activa), y la escritura la encuentra desactivada. Sólo la
 * primera transacción: la de la reserva o la de la inscripción.
 */
function desactivarJustoAntesDeEscribir(sedeId: string) {
  const transaccion = base.prisma.$transaction.bind(base.prisma) as (...args: unknown[]) => Promise<unknown>
  return vi.spyOn(base.prisma, "$transaction").mockImplementationOnce((async (...args: unknown[]) => {
    await base.prisma.sede.update({ where: { id: sedeId }, data: { activo: false } })
    return transaccion(...args)
  }) as never)
}

const conSlug = (slug = "salon-uno") => ({ params: Promise.resolve({ slug }) })

async function confirmar(hora: string, extra: Registro = {}) {
  const { POST } = await import("./confirmar/route")
  const cuerpo = { servicioId: "s-corte", fecha: LUNES, hora, nombre: "Lucía", apellido: "Pérez", email: "lucia@correo.test", ...extra }
  const respuesta = await POST({ headers: new Headers(), body: cuerpoDePrueba(cuerpo) } as unknown as NextRequest, conSlug())
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

async function inscribirse(extra: Registro = {}) {
  const { POST } = await import("./lista-de-espera/route")
  const cuerpo = { servicioId: "s-corte", fecha: LUNES, nombre: "Lucía", apellido: "Pérez", email: "lucia@correo.test", ...extra }
  const pedido = new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  }) as unknown as NextRequest
  const respuesta = await POST(pedido, conSlug())
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const reservasHechas = () => base.buscar("appointment", { source: "reserva-publica" })
const inscripcionesHechas = () => base.buscar("inscripcionEnEspera", {})
const clientesDeLucia = () => base.buscar("customer", { email: "lucia@correo.test" })

beforeEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date("2030-01-01T12:00:00.000Z"))
  mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 9 })
  escenario()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("POST /api/reservar/[slug]/confirmar con la sede desactivada a mitad de la reserva", () => {
  it("control: sin carrera, la reserva en esa sede se guarda", async () => {
    const { status } = await confirmar("09:00", { sedeId: CENTRO })

    expect(status).toBe(201)
    expect(reservasHechas()[0]).toMatchObject({ sedeId: CENTRO })
  })

  it("si la sede se desactiva entre la lectura y la escritura: 409 claro, y no se guarda nada (ni cita, ni cliente, ni correos)", async () => {
    desactivarJustoAntesDeEscribir(CENTRO)

    const { status, cuerpo } = await confirmar("09:00", { sedeId: CENTRO })

    expect(status).toBe(409)
    expect(cuerpo).toEqual({ error: MENSAJE_SEDE_YA_NO_DISPONIBLE })
    expect(base.buscar("sede", { id: CENTRO })[0]).toMatchObject({ activo: false })
    expect(reservasHechas()).toHaveLength(0)
    expect(clientesDeLucia()).toHaveLength(0)
    expect(enviarConfirmacionCliente).not.toHaveBeenCalled()
    expect(enviarAvisoProfesional).not.toHaveBeenCalled()
  })

  it("después del 409 puede elegir otra sede y la reserva entra", async () => {
    desactivarJustoAntesDeEscribir(CENTRO)
    await confirmar("09:00", { sedeId: CENTRO })

    const { status } = await confirmar("14:00", { sedeId: PROVIDENCIA })

    expect(status).toBe(201)
    expect(reservasHechas()).toHaveLength(1)
    expect(reservasHechas()[0]).toMatchObject({ sedeId: PROVIDENCIA })
  })

  it("el 409 no revela nada de la base: ni el id de la sede ni el texto del trigger", async () => {
    desactivarJustoAntesDeEscribir(CENTRO)

    const { cuerpo } = await confirmar("09:00", { sedeId: CENTRO })

    expect(JSON.stringify(cuerpo)).not.toMatch(/23514|citas |sede-centro|trigger/)
  })
})

describe("POST /api/reservar/[slug]/lista-de-espera con la sede desactivada a mitad de la inscripción", () => {
  /** El lunes del Centro, lleno: la inscripción es válida (no hay horas libres que ofrecer). */
  const centroLleno = () => escenario(["09:00", "10:00", "11:00"].map((hora) => ({ id: `c-${hora}`, businessId: NEGOCIO, title: "Corte", memberId: null, sedeId: CENTRO, startTime: aLas(hora), endTime: new Date(aLas(hora).getTime() + 3600_000) })))

  it("control: sin carrera, la inscripción en esa sede se guarda", async () => {
    centroLleno()

    const { status } = await inscribirse({ sedeId: CENTRO })

    expect(status).toBe(201)
    expect(inscripcionesHechas()[0]).toMatchObject({ sedeId: CENTRO, estado: "activa" })
  })

  it("si la sede se desactiva entre la lectura y la escritura: 409 claro, y no se guarda nada", async () => {
    centroLleno()
    desactivarJustoAntesDeEscribir(CENTRO)

    const { status, cuerpo } = await inscribirse({ sedeId: CENTRO })

    expect(status).toBe(409)
    expect(cuerpo).toEqual({ error: MENSAJE_SEDE_YA_NO_DISPONIBLE })
    expect(base.buscar("sede", { id: CENTRO })[0]).toMatchObject({ activo: false })
    expect(inscripcionesHechas()).toHaveLength(0)
  })
})
