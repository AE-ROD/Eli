import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { NextRequest } from "next/server"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, datosBase } from "@/pruebas/datos"
import { cuerpoDePrueba } from "@/pruebas/pedidos"
import { enviarAvisoProfesional, enviarConfirmacionCliente } from "@/lib/email"
import { MENSAJE_URGENCIA_SOLO_HOY } from "@/lib/reserva-publica"

/**
 * Confirmar una reserva pública en una clínica dental: la duración la calcula
 * el servidor (la primera vez suma 15 minutos, mande lo que mande el
 * navegador), se guarda `primeraVez`, una urgencia sólo se acepta para hoy
 * (también si el pedido se arma a mano), y la reserva nunca asigna sillón.
 * En un salón todo sigue como siempre.
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
const MARTES = "2030-01-08"
const santiago = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00.000-03:00`)

const SEMANA_ANTES = "2030-01-01T12:00:00.000Z"
/** El lunes a las 08:00 de Santiago: "hoy" es el lunes. */
const LUNES_A_LAS_8 = "2030-01-07T11:00:00.000Z"

type Rubro = "odontologia" | "salon"

/**
 * El negocio 1 con el rubro pedido, una limpieza de 45 minutos, una urgencia
 * de 30 y un sillón (que la reserva no debe usar). Atiende lunes y martes de
 * 09:00 a 10:15: con 45 minutos entran las 09:00 y las 09:30; con 60, sólo
 * las 09:00.
 */
function escenario(rubro: Rubro) {
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    business: datos.business.map((negocio) => (negocio.id === NEGOCIO ? { ...negocio, type: rubro } : negocio)),
    service: [
      ...datos.service,
      { id: "s-limpieza", businessId: NEGOCIO, name: "Limpieza", duration: 45, price: 35000 },
      { id: "s-urgencia", businessId: NEGOCIO, name: "Urgencia dental", duration: 30, price: 40000, esUrgencia: true },
    ],
    sillon: rubro === "odontologia" ? [{ id: "sl-1", businessId: NEGOCIO, nombre: "Sillón 1", orden: 1 }] : [],
    workSchedule: [1, 2].map((dayOfWeek) => ({
      id: `h-${dayOfWeek}`,
      businessId: NEGOCIO,
      memberId: null,
      dayOfWeek,
      startTime: "09:00",
      endTime: "10:15",
    })),
  })
}

async function confirmar(cuerpo: Record<string, unknown>) {
  const { POST } = await import("./route")
  const pedido = { headers: new Headers(), body: cuerpoDePrueba(cuerpo) } as unknown as NextRequest
  const respuesta = await POST(pedido, { params: Promise.resolve({ slug: "salon-uno" }) })
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const reserva = (extra: Record<string, unknown>) => ({ nombre: "Lucía", apellido: "Pérez", ...extra })

const citas = () => base.buscar("appointment")
const minutosDe = (cita: Record<string, unknown>) =>
  ((cita.endTime as Date).getTime() - (cita.startTime as Date).getTime()) / 60_000

function relojEn(instante: string) {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(instante))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 9 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("POST confirmar: el rubro de los correos sale del negocio", () => {
  beforeEach(() => relojEn(SEMANA_ANTES))

  it.each(["odontologia", "salon"] as const)("la confirmación y el aviso llevan el rubro del negocio (%s)", async (rubro) => {
    escenario(rubro)

    // Un navegador que manda su propio "rubro" no cambia nada: sale de la base.
    const { status } = await confirmar(
      reserva({ servicioId: "s-limpieza", fecha: LUNES, hora: "09:00", email: "lucia@correo.test", primeraVez: false, rubro: "otro" })
    )

    expect(status).toBe(201)
    expect(vi.mocked(enviarConfirmacionCliente)).toHaveBeenCalledWith(expect.objectContaining({ rubro }))
    expect(vi.mocked(enviarAvisoProfesional)).toHaveBeenCalledWith(expect.objectContaining({ rubro }))
  })
})

describe("POST confirmar, clínica dental: la primera vez", () => {
  beforeEach(() => relojEn(SEMANA_ANTES))

  it("primera vez: la cita dura la limpieza más 15 minutos y queda marcada", async () => {
    escenario("odontologia")

    const { status } = await confirmar(reserva({ servicioId: "s-limpieza", fecha: LUNES, hora: "09:00", primeraVez: true }))

    expect(status).toBe(201)
    expect(citas()).toHaveLength(1)
    expect(citas()[0]).toMatchObject({ startTime: santiago(LUNES, "09:00"), endTime: santiago(LUNES, "10:00"), primeraVez: true })
  })

  it("ya se atendió: lo que dura la limpieza, sin marca", async () => {
    escenario("odontologia")

    const { status } = await confirmar(reserva({ servicioId: "s-limpieza", fecha: LUNES, hora: "09:00", primeraVez: false }))

    expect(status).toBe(201)
    expect(minutosDe(citas()[0])).toBe(45)
    expect(citas()[0].primeraVez).toBe(false)
  })

  it("la duración la calcula el servidor: lo que mande el navegador no se usa", async () => {
    escenario("odontologia")

    const { status } = await confirmar(
      reserva({ servicioId: "s-limpieza", fecha: LUNES, hora: "09:00", primeraVez: true, duracion: 5, duration: 5, endTime: "x" })
    )

    expect(status).toBe(201)
    expect(minutosDe(citas()[0])).toBe(60)
  })

  it("una hora en que entran 45 minutos pero no 60: con primera vez, 409 sin crear nada", async () => {
    escenario("odontologia")

    const conPrimeraVez = await confirmar(reserva({ servicioId: "s-limpieza", fecha: LUNES, hora: "09:30", primeraVez: true }))
    expect(conPrimeraVez.status).toBe(409)
    expect(conPrimeraVez.cuerpo.error).toMatch(/fuera de la atención/)
    expect(citas()).toHaveLength(0)

    // La misma hora, ya atendida antes, sí entra: es la hora que la disponibilidad ofrece.
    expect((await confirmar(reserva({ servicioId: "s-limpieza", fecha: LUNES, hora: "09:30", primeraVez: false }))).status).toBe(201)
    expect(minutosDe(citas()[0])).toBe(45)
  })

  it("la reserva no asigna sillón: lo asigna la clínica", async () => {
    escenario("odontologia")

    await confirmar(reserva({ servicioId: "s-limpieza", fecha: LUNES, hora: "09:00", primeraVez: true, sillonId: "sl-1" }))

    expect(citas()[0].sillonId).toBeNull()
  })

  it("un valor que no es sí o no es un 400", async () => {
    escenario("odontologia")

    const { status } = await confirmar(reserva({ servicioId: "s-limpieza", fecha: LUNES, hora: "09:00", primeraVez: "si" }))

    expect(status).toBe(400)
    expect(citas()).toHaveLength(0)
  })
})

describe("POST confirmar, clínica dental: la urgencia sólo para hoy", () => {
  beforeEach(() => relojEn(LUNES_A_LAS_8))

  it("hoy: se reserva", async () => {
    escenario("odontologia")

    const { status } = await confirmar(reserva({ servicioId: "s-urgencia", fecha: LUNES, hora: "09:00" }))

    expect(status).toBe(201)
    expect(citas()[0]).toMatchObject({ title: "Urgencia dental", startTime: santiago(LUNES, "09:00") })
  })

  it("otro día (un pedido armado a mano): 400 con el motivo, sin crear nada", async () => {
    escenario("odontologia")
    const antes = base.volcado()

    const { status, cuerpo } = await confirmar(reserva({ servicioId: "s-urgencia", fecha: MARTES, hora: "09:00" }))

    expect(status).toBe(400)
    expect(cuerpo.error).toBe(MENSAJE_URGENCIA_SOLO_HOY)
    expect(base.volcado()).toEqual(antes)
  })

  it("basta con que uno de los motivos sea urgencia", async () => {
    escenario("odontologia")

    const { status } = await confirmar(reserva({ servicioIds: ["s-limpieza", "s-urgencia"], fecha: MARTES, hora: "09:00" }))

    expect(status).toBe(400)
    expect(citas()).toHaveLength(0)
  })

  it("otro motivo, otro día: se reserva como siempre", async () => {
    escenario("odontologia")

    expect((await confirmar(reserva({ servicioId: "s-limpieza", fecha: MARTES, hora: "09:00" }))).status).toBe(201)
  })
})

describe("POST confirmar, salón: nada cambia", () => {
  it("primeraVez se ignora: dura lo del servicio y la cita no lo guarda", async () => {
    relojEn(SEMANA_ANTES)
    escenario("salon")

    const { status } = await confirmar(reserva({ servicioId: "s-limpieza", fecha: LUNES, hora: "09:30", primeraVez: true }))

    expect(status).toBe(201)
    expect(minutosDe(citas()[0])).toBe(45)
    expect(citas()[0].primeraVez).toBe(false)
  })

  it("un servicio marcado como urgencia se reserva cualquier día", async () => {
    relojEn(LUNES_A_LAS_8)
    escenario("salon")

    expect((await confirmar(reserva({ servicioId: "s-urgencia", fecha: MARTES, hora: "09:00" }))).status).toBe(201)
  })
})
