import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"

const mockVerificarLimite = vi.fn()

vi.mock("@/lib/rate-limit", () => ({
  obtenerIp: () => "203.0.113.7",
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
}))

const prismaMock = {
  business: { findUnique: vi.fn() },
  service: { findFirst: vi.fn() },
  workSchedule: { findFirst: vi.fn() },
  appointment: { findMany: vi.fn() },
}

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

/** Un lunes lejano: nunca es "hoy", así que no se filtran horas pasadas. */
const FECHA = "2030-01-07"

const fakeRequest = (query: string): NextRequest =>
  ({ url: `http://localhost/api/reservar/salon-uno/disponibilidad${query}`, headers: new Headers() }) as unknown as NextRequest

const conSlug = { params: Promise.resolve({ slug: "salon-uno" }) }

/** Ningún pedido rechazado tiene que llegar a la base. */
function expectSinConsultas() {
  expect(prismaMock.business.findUnique).not.toHaveBeenCalled()
  expect(prismaMock.service.findFirst).not.toHaveBeenCalled()
  expect(prismaMock.workSchedule.findFirst).not.toHaveBeenCalled()
  expect(prismaMock.appointment.findMany).not.toHaveBeenCalled()
}

describe("GET /api/reservar/[slug]/disponibilidad", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 59 })
    prismaMock.business.findUnique.mockResolvedValue({ id: "negocio-1" })
    prismaMock.service.findFirst.mockResolvedValue({ duration: 60 })
    prismaMock.workSchedule.findFirst.mockResolvedValue({ startTime: "09:00", endTime: "12:00" })
    prismaMock.appointment.findMany.mockResolvedValue([])
  })

  it("está limitado por IP con el límite de lectura pública: pasado el tope, 429 sin tocar la base", async () => {
    const { GET } = await import("./route")

    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })

    const res = await GET(fakeRequest(`?fecha=${FECHA}&servicioId=s-corte`), conSlug)

    expect(res.status).toBe(429)
    expect(mockVerificarLimite).toHaveBeenCalledWith("lecturaPublica", "203.0.113.7")
    expectSinConsultas()
  })

  it("con una fecha y un servicio válidos devuelve las horas libres del día", async () => {
    const { GET } = await import("./route")

    // Ocupada de 10 a 11 (hora del servidor, igual que la cuenta de los turnos).
    prismaMock.appointment.findMany.mockResolvedValueOnce([
      { startTime: new Date(2030, 0, 7, 10, 0), endTime: new Date(2030, 0, 7, 11, 0) },
    ])

    const res = await GET(fakeRequest(`?fecha=${FECHA}&servicioId=s-corte`), conSlug)

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

    const res = await GET(fakeRequest(query), conSlug)
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

    const res = await GET(fakeRequest(query), conSlug)
    const data = await res.json()

    expect(res.status).toBe(400)
    expect(data.error).toMatch(/servicio/i)
    expectSinConsultas()
  })
})
