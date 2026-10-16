import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"

const mockVerificarLimite = vi.fn()

vi.mock("@/lib/rate-limit", () => ({
  obtenerIp: () => "203.0.113.7",
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
}))

const prismaMock = {
  workerInvitation: { findUnique: vi.fn() },
}

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

const invitacionVigente = {
  id: "inv-1",
  businessId: "negocio-1",
  email: "carla@uno.test",
  name: "Carla Profesional",
  role: "worker",
  token: "token-valido",
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  acceptedAt: null,
  createdAt: new Date(),
  business: { name: "Salón Uno" },
}

const fakeRequest = (): NextRequest => ({ headers: new Headers() }) as unknown as NextRequest

const conToken = (token: string) => ({ params: Promise.resolve({ token }) })

describe("GET /api/equipo/invitacion/[token]", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 4 })
    prismaMock.workerInvitation.findUnique.mockResolvedValue(invitacionVigente)
  })

  it("está limitado por IP con el mismo límite que `aceptar`: pasado el tope, 429 sin buscar el token", async () => {
    const { GET } = await import("./route")

    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })

    const res = await GET(fakeRequest(), conToken("token-valido"))

    expect(res.status).toBe(429)
    expect(typeof (await res.json()).error).toBe("string")
    expect(mockVerificarLimite).toHaveBeenCalledWith("auth", "203.0.113.7")
    expect(prismaMock.workerInvitation.findUnique).not.toHaveBeenCalled()
  })

  it("también cuentan los tokens que no existen: probar tokens a ciegas gasta el cupo", async () => {
    const { GET } = await import("./route")

    prismaMock.workerInvitation.findUnique.mockResolvedValueOnce(null)

    const res = await GET(fakeRequest(), conToken("token-inventado"))

    expect(res.status).toBe(404)
    expect(mockVerificarLimite).toHaveBeenCalledTimes(1)
    expect(mockVerificarLimite).toHaveBeenCalledWith("auth", "203.0.113.7")
  })

  it("dentro del límite responde lo que muestra la pantalla de aceptar, y nada más", async () => {
    const { GET } = await import("./route")

    const res = await GET(fakeRequest(), conToken("token-valido"))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      nombre: "Carla Profesional",
      email: "carla@uno.test",
      rol: "worker",
      negocio: "Salón Uno",
    })
  })
})
