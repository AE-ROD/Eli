import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { NextRequest } from "next/server"

const mockEnviarRecordatorio = vi.fn()

vi.mock("@/lib/email", () => ({
  enviarRecordatorio: (...args: unknown[]) => mockEnviarRecordatorio(...args),
}))

const prismaMock = {
  appointment: { findMany: vi.fn() },
}

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

const SECRETO = "secreto-del-cron-de-prueba"

const citaDeMañana = {
  startTime: new Date("2026-10-07T13:00:00.000Z"),
  title: "Corte",
  customer: { name: "María", lastName: "González", email: "maria@example.com" },
  business: { name: "Salón Uno" },
}

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
    mockEnviarRecordatorio.mockResolvedValue(null)
  })

  afterEach(() => vi.unstubAllEnvs())

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
})
