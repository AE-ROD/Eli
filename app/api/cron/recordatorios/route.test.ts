import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { NextRequest } from "next/server"

const mockEnviarRecordatorio = vi.fn()

vi.mock("@/lib/email", () => ({
  enviarRecordatorio: (...args: unknown[]) => mockEnviarRecordatorio(...args),
}))

const prismaMock = {
  appointment: { findMany: vi.fn(), updateMany: vi.fn() },
}

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

const SECRETO = "secreto-del-cron-de-prueba"

/** "Ahora" de los tests: martes 6 de octubre de 2026, 10:00 en Santiago (UTC-3). */
const AHORA = new Date("2026-10-06T13:00:00.000Z")

/** Miércoles 7 a las 10:00 en Santiago: mañana para el negocio. */
const citaDeMañana = {
  id: "cita-1",
  businessId: "negocio-1",
  startTime: new Date("2026-10-07T13:00:00.000Z"),
  title: "Corte",
  customer: { name: "María", lastName: "González", email: "maria@example.com", businessId: "negocio-1" },
  business: { name: "Salón Uno", timezone: "America/Santiago" },
}

const ENVIADO = { data: { id: "correo-1" }, error: null }

const llamada = (headers: Record<string, string> = {}): NextRequest =>
  ({ headers: new Headers(headers) }) as unknown as NextRequest

/** Un 401 no lee citas ni manda correos. */
function expectSinEfectos() {
  expect(prismaMock.appointment.findMany).not.toHaveBeenCalled()
  expect(mockEnviarRecordatorio).not.toHaveBeenCalled()
}

describe("GET /api/cron/recordatorios", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("CRON_SECRET", SECRETO)
    prismaMock.appointment.findMany.mockResolvedValue([citaDeMañana])
    prismaMock.appointment.updateMany.mockResolvedValue({ count: 1 })
    mockEnviarRecordatorio.mockResolvedValue(ENVIADO)
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(AHORA)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it("con el header que manda Vercel Cron (`Authorization: Bearer <CRON_SECRET>`): 200 y salen los recordatorios", async () => {
    const { GET } = await import("./route")

    const res = await GET(llamada({ authorization: `Bearer ${SECRETO}` }))

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ total: 1 })
    expect(mockEnviarRecordatorio).toHaveBeenCalledTimes(1)
    expect(mockEnviarRecordatorio).toHaveBeenCalledWith(expect.objectContaining({ emailCliente: "maria@example.com" }))
  })

  it("con un Bearer incorrecto: 401", async () => {
    const { GET } = await import("./route")

    const res = await GET(llamada({ authorization: "Bearer otro-secreto" }))

    expect(res.status).toBe(401)
    expectSinEfectos()
  })

  it("con el secreto pero sin el esquema `Bearer`: 401", async () => {
    const { GET } = await import("./route")

    const res = await GET(llamada({ authorization: SECRETO }))

    expect(res.status).toBe(401)
    expectSinEfectos()
  })

  it("sin header: 401", async () => {
    const { GET } = await import("./route")

    const res = await GET(llamada())

    expect(res.status).toBe(401)
    expectSinEfectos()
  })

  it("sin CRON_SECRET en el entorno: 401, aunque llegue `Bearer undefined`", async () => {
    vi.stubEnv("CRON_SECRET", undefined)
    const { GET } = await import("./route")

    const res = await GET(llamada({ authorization: "Bearer undefined" }))

    expect(res.status).toBe(401)
    expectSinEfectos()
  })

  it("con CRON_SECRET vacío: 401, aunque los headers lleguen vacíos", async () => {
    vi.stubEnv("CRON_SECRET", "")
    const { GET } = await import("./route")

    const res = await GET(llamada({ authorization: "Bearer ", "x-cron-secret": "" }))

    expect(res.status).toBe(401)
    expectSinEfectos()
  })

  it("`x-cron-secret` se sigue aceptando por compatibilidad, con el mismo secreto", async () => {
    const { GET } = await import("./route")

    const correcto = await GET(llamada({ "x-cron-secret": SECRETO }))
    expect(correcto.status).toBe(200)

    vi.clearAllMocks()
    const incorrecto = await GET(llamada({ "x-cron-secret": "otro-secreto" }))
    expect(incorrecto.status).toBe(401)
    expectSinEfectos()
  })

  describe("qué cita se recuerda y cómo", () => {
    const autorizada = () => llamada({ authorization: `Bearer ${SECRETO}` })

    it("busca sólo citas sin recordatorio, de clientes con email, ni canceladas, ni completadas, ni 'no vino'", async () => {
      const { GET } = await import("./route")

      await GET(autorizada())

      const { where } = prismaMock.appointment.findMany.mock.calls[0][0]
      expect(where.reminderSentAt).toBeNull()
      expect(where.status.notIn).toEqual(expect.arrayContaining(["cancelada", "completada", "no-asistio"]))
      expect(where.customer).toEqual({ email: { not: null } })
      expect(where.startTime.gte).toEqual(AHORA)
    })

    it("la fecha y la hora del correo son las del reloj del negocio, no las del servidor", async () => {
      const { GET } = await import("./route")

      await GET(autorizada())

      expect(mockEnviarRecordatorio).toHaveBeenCalledWith(
        expect.objectContaining({ fecha: "2026-10-07", hora: "10:00", nombreCliente: "María González" })
      )
    })

    it("'mañana' es en la zona del negocio: una cita de pasado mañana en Santiago no sale, aunque en UTC sea mañana", async () => {
      // 22:00 del martes en Santiago = 01:00 UTC del miércoles. La cita del
      // jueves 8 a las 10:00 de Santiago (13:00 UTC) es "mañana" en UTC pero
      // pasado mañana para el negocio; la del miércoles 7 a las 23:30 sí es mañana.
      vi.setSystemTime(new Date("2026-10-07T01:00:00.000Z"))
      const deJueves = { ...citaDeMañana, id: "jueves", startTime: new Date("2026-10-08T13:00:00.000Z") }
      const deMiercolesNoche = { ...citaDeMañana, id: "miercoles", startTime: new Date("2026-10-08T02:30:00.000Z") }
      prismaMock.appointment.findMany.mockResolvedValue([deJueves, deMiercolesNoche])
      const { GET } = await import("./route")

      const res = await GET(autorizada())

      expect(await res.json()).toMatchObject({ total: 1, enviados: 1 })
      expect(mockEnviarRecordatorio).toHaveBeenCalledTimes(1)
      expect(mockEnviarRecordatorio).toHaveBeenCalledWith(expect.objectContaining({ fecha: "2026-10-07", hora: "23:30" }))
    })

    it("cada negocio con su zona: el mismo instante es mañana para uno y hoy para otro", async () => {
      // Ahora: martes 6, 10:00 en Santiago; en Auckland ya es miércoles 7 a las 02:00.
      // La cita del 7 a las 03:30 UTC es el miércoles 00:30 en Santiago (mañana)
      // y el miércoles 16:30 en Auckland (hoy).
      const startTime = new Date("2026-10-07T03:30:00.000Z")
      const enSantiago = { ...citaDeMañana, startTime }
      const enAuckland = { ...citaDeMañana, id: "auckland", startTime, businessId: "negocio-2", customer: { ...citaDeMañana.customer, businessId: "negocio-2" }, business: { name: "Salón Dos", timezone: "Pacific/Auckland" } }
      prismaMock.appointment.findMany.mockResolvedValue([enSantiago, enAuckland])
      const { GET } = await import("./route")

      await GET(autorizada())

      expect(mockEnviarRecordatorio).toHaveBeenCalledTimes(1)
      expect(mockEnviarRecordatorio).toHaveBeenCalledWith(expect.objectContaining({ nombreNegocio: "Salón Uno", hora: "00:30" }))
    })

    it("pide el negocio de la cita y el de su cliente, para compararlos", async () => {
      const { GET } = await import("./route")

      await GET(autorizada())

      const { select } = prismaMock.appointment.findMany.mock.calls[0][0]
      expect(select.businessId).toBe(true)
      expect(select.customer.select.businessId).toBe(true)
    })

    it("si el cliente es de otro negocio que la cita, no envía ni la marca: la cuenta como omitida", async () => {
      const cruzada = { ...citaDeMañana, id: "cruzada", customer: { ...citaDeMañana.customer, businessId: "negocio-ajeno" } }
      prismaMock.appointment.findMany.mockResolvedValue([cruzada, citaDeMañana])
      const espia = vi.spyOn(console, "error").mockImplementation(() => {})
      const { GET } = await import("./route")

      const res = await GET(autorizada())

      expect(await res.json()).toMatchObject({ total: 1, enviados: 1, fallidos: 0, omitidas: 1 })
      expect(mockEnviarRecordatorio).toHaveBeenCalledTimes(1)
      expect(prismaMock.appointment.updateMany).toHaveBeenCalledTimes(1)
      expect(prismaMock.appointment.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "cita-1", reminderSentAt: null } }))
      // Se registra sólo el id: ni el correo ni el nombre del cliente.
      expect(espia).toHaveBeenCalledWith(expect.stringContaining("omitido"), { citaId: "cruzada" })
      espia.mockRestore()
    })

    it("marca reminderSentAt antes de enviar, y sólo si seguía vacío", async () => {
      const { GET } = await import("./route")

      await GET(autorizada())

      expect(prismaMock.appointment.updateMany).toHaveBeenCalledTimes(1)
      expect(prismaMock.appointment.updateMany).toHaveBeenCalledWith({
        where: { id: "cita-1", reminderSentAt: null },
        data: { reminderSentAt: AHORA },
      })
      expect(prismaMock.appointment.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        mockEnviarRecordatorio.mock.invocationCallOrder[0]
      )
    })

    it("si otro proceso ya la marcó, no la reenvía", async () => {
      prismaMock.appointment.updateMany.mockResolvedValue({ count: 0 })
      const { GET } = await import("./route")

      const res = await GET(autorizada())

      expect(res.status).toBe(200)
      expect(mockEnviarRecordatorio).not.toHaveBeenCalled()
    })

    it("si el envío falla, libera la marca para que se pueda reintentar", async () => {
      mockEnviarRecordatorio.mockResolvedValue({ data: null, error: { name: "rate_limit_exceeded", message: "x" } })
      const { GET } = await import("./route")

      const res = await GET(autorizada())

      expect(await res.json()).toMatchObject({ enviados: 0, fallidos: 1 })
      expect(prismaMock.appointment.updateMany).toHaveBeenLastCalledWith({
        where: { id: "cita-1", reminderSentAt: AHORA },
        data: { reminderSentAt: null },
      })
    })

    it("si el envío lanza, también la libera y sigue con las demás", async () => {
      const otra = { ...citaDeMañana, id: "cita-2" }
      prismaMock.appointment.findMany.mockResolvedValue([citaDeMañana, otra])
      mockEnviarRecordatorio.mockRejectedValueOnce(new Error("caída")).mockResolvedValueOnce(ENVIADO)
      vi.spyOn(console, "error").mockImplementation(() => {})
      const { GET } = await import("./route")

      const res = await GET(autorizada())

      expect(await res.json()).toMatchObject({ total: 2, enviados: 1, fallidos: 1 })
      expect(prismaMock.appointment.updateMany).toHaveBeenCalledWith({
        where: { id: "cita-1", reminderSentAt: AHORA },
        data: { reminderSentAt: null },
      })
    })
  })
})
