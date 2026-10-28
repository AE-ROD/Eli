import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { NextRequest } from "next/server"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase } from "@/pruebas/datos"
import { MARCA_DE_CLIENTE_ELIMINADO } from "@/lib/clientes-eliminados"
import { MENSAJE_DE_TELEFONO_ILEGIBLE } from "@/lib/telefono"

/**
 * El teléfono de la reserva pública se guarda en E.164 y el consentimiento
 * de WhatsApp se registra sin pisar uno previo (P8, parte pública).
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

const AHORA = new Date("2030-01-01T12:00:00.000Z")
const ANTES = new Date("2029-06-01T12:00:00.000Z")

type Registro = Record<string, unknown>

function escenario(clientes: Registro[] = []) {
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    customer: [...datos.customer, ...clientes],
    workSchedule: [{ id: "h", businessId: NEGOCIO, memberId: null, dayOfWeek: 1, startTime: "09:00", endTime: "18:00" }],
  })
}

async function reservar(extra: Registro, hora = "10:00") {
  const { POST } = await import("./route")
  const cuerpo = { servicioId: "s-corte", fecha: "2030-01-07", hora, nombre: "Lucía", apellido: "Pérez", ...extra }
  const respuesta = await POST({ headers: new Headers(), json: async () => cuerpo } as unknown as NextRequest, {
    params: Promise.resolve({ slug: "salon-uno" }),
  })
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const lucias = () => base.buscar("customer", { name: "Lucía", businessId: NEGOCIO })

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(AHORA)
  mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 9 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("teléfono", () => {
  it.each(["9 1234 5678", "+56 9 1234 5678", "912345678", "56912345678"])("%s se guarda en E.164", async (telefono) => {
    escenario()
    expect((await reservar({ telefono })).status).toBe(201)
    expect(lucias()[0].phone).toBe("+56912345678")
  })

  it("vacío o sin dar: sin teléfono", async () => {
    escenario()
    expect((await reservar({ telefono: "" })).status).toBe(201)
    expect((await reservar({}, "11:00")).status).toBe(201)
    expect(lucias().map((cliente) => cliente.phone)).toEqual([null, null])
  })

  it.each(["123", "+1 415 555 0100", "hola"])("ilegible (%s): 400 con el mensaje claro, sin crear nada", async (telefono) => {
    escenario()
    const { status, cuerpo } = await reservar({ telefono })
    expect(status).toBe(400)
    expect(cuerpo.error).toBe(MENSAJE_DE_TELEFONO_ILEGIBLE)
    expect(lucias()).toHaveLength(0)
    expect(base.buscar("appointment")).toHaveLength(0)
  })
})

describe("consentimiento de WhatsApp", () => {
  it("marcado, en un cliente nuevo: se guarda cuándo y que vino de la reserva pública", async () => {
    escenario()
    expect((await reservar({ telefono: "912345678", whatsappConsentimiento: true })).status).toBe(201)
    expect(lucias()[0]).toMatchObject({ whatsappConsentAt: AHORA, whatsappConsentSource: "reserva-publica" })
  })

  it("sin marcar: no se registra", async () => {
    escenario()
    await reservar({ telefono: "912345678", whatsappConsentimiento: false })
    expect(lucias()[0]).toMatchObject({ whatsappConsentAt: null, whatsappConsentSource: null })
  })

  it("marcado, en un cliente que ya existía sin consentimiento: se registra", async () => {
    escenario([{ id: "c-lucia", businessId: NEGOCIO, name: "Lucía", lastName: "Pérez", email: "lucia@correo.test" }])
    await reservar({ email: "lucia@correo.test", whatsappConsentimiento: true })
    expect(lucias()).toHaveLength(1)
    expect(lucias()[0]).toMatchObject({ id: "c-lucia", whatsappConsentAt: AHORA, whatsappConsentSource: "reserva-publica" })
  })

  it("marcado, no pisa uno previo (dado en el local)", async () => {
    escenario([
      { id: "c-lucia", businessId: NEGOCIO, name: "Lucía", lastName: "Pérez", email: "lucia@correo.test", whatsappConsentAt: ANTES, whatsappConsentSource: "panel" },
    ])
    await reservar({ email: "lucia@correo.test", whatsappConsentimiento: true })
    expect(lucias()[0]).toMatchObject({ whatsappConsentAt: ANTES, whatsappConsentSource: "panel" })
  })

  it("sin marcar, no borra uno previo", async () => {
    escenario([
      { id: "c-lucia", businessId: NEGOCIO, name: "Lucía", lastName: "Pérez", email: "lucia@correo.test", whatsappConsentAt: ANTES, whatsappConsentSource: "panel" },
    ])
    await reservar({ email: "lucia@correo.test" })
    expect(lucias()[0]).toMatchObject({ whatsappConsentAt: ANTES, whatsappConsentSource: "panel" })
  })

  it("aislamiento: una clienta con los mismos datos en otro negocio no se toca ni se reutiliza", async () => {
    escenario([{ id: "c-ajena", businessId: OTRO_NEGOCIO, name: "Lucía", lastName: "Pérez", email: "lucia@correo.test" }])
    await reservar({ email: "lucia@correo.test", whatsappConsentimiento: true })
    expect(base.buscar("customer", { id: "c-ajena" })[0]).toMatchObject({ whatsappConsentAt: null })
    expect(lucias()).toHaveLength(1)
  })

  it("un cliente eliminado (anonimizado) no se reutiliza ni recibe el consentimiento", async () => {
    escenario([
      { id: "c-eliminada", businessId: NEGOCIO, name: "Lucía", lastName: "Pérez", email: "lucia@correo.test", tags: [MARCA_DE_CLIENTE_ELIMINADO] },
    ])
    await reservar({ email: "lucia@correo.test", whatsappConsentimiento: true })
    expect(base.buscar("customer", { id: "c-eliminada" })[0]).toMatchObject({ whatsappConsentAt: null })
    expect(lucias()).toHaveLength(2)
  })

  it("un valor que no es sí/no: 400", async () => {
    escenario()
    expect((await reservar({ whatsappConsentimiento: "sí" })).status).toBe(400)
  })
})
