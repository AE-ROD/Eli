import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"

const mockGetToken = vi.fn()
const mockVerificarLimite = vi.fn()

vi.mock("next-auth/jwt", () => ({
  getToken: (...args: unknown[]) => mockGetToken(...args),
}))

vi.mock("@/lib/rate-limit", () => ({
  obtenerIp: () => "127.0.0.1",
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
}))

const fakeRequest = (pathname: string, method = "GET"): NextRequest =>
  ({
    method,
    url: `http://localhost${pathname}`,
    nextUrl: { pathname },
    headers: new Headers(),
  }) as unknown as NextRequest

describe("middleware — rate limit de los endpoints del panel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetToken.mockResolvedValue({ id: "usuario-1", businessId: "negocio-1" })
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 100 })
  })

  it("responde 429 con un mensaje entendible cuando se pasa el límite", async () => {
    const { default: middleware } = await import("./middleware")

    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })

    const res = await middleware(fakeRequest("/api/pacientes"))
    const data = await res.json()

    expect(res.status).toBe(429)
    expect(typeof data.error).toBe("string")
    expect(data.error.length).toBeGreaterThan(0)
    // Nada de un error crudo (stack, objeto de Upstash, etc.)
    expect(data.error).not.toMatch(/upstash|stack|ratelimit/i)
  })

  it("cuenta por sesión (usuario), no sólo por IP: usa el id del actor como clave", async () => {
    const { default: middleware } = await import("./middleware")

    mockGetToken.mockResolvedValueOnce({ id: "usuario-42", businessId: "negocio-1" })

    await middleware(fakeRequest("/api/citas"))

    expect(mockVerificarLimite).toHaveBeenCalledWith("panelLectura", "usuario:usuario-42")
  })

  it("dos personas del mismo negocio (misma IP, distinta sesión) no comparten el cupo", async () => {
    const { default: middleware } = await import("./middleware")

    mockGetToken.mockResolvedValueOnce({ id: "empleado-a", businessId: "negocio-1" })
    await middleware(fakeRequest("/api/citas"))

    mockGetToken.mockResolvedValueOnce({ id: "empleado-b", businessId: "negocio-1" })
    await middleware(fakeRequest("/api/citas"))

    const claves = mockVerificarLimite.mock.calls.map((llamada) => llamada[1])
    expect(claves[0]).not.toBe(claves[1])
  })

  it("usa el límite de escritura (más bajo) en POST/PUT/DELETE y el de lectura en GET", async () => {
    const { default: middleware } = await import("./middleware")

    await middleware(fakeRequest("/api/pacientes", "GET"))
    expect(mockVerificarLimite).toHaveBeenLastCalledWith("panelLectura", expect.any(String))

    await middleware(fakeRequest("/api/pacientes", "POST"))
    expect(mockVerificarLimite).toHaveBeenLastCalledWith("panelEscritura", expect.any(String))
  })

  it("deja pasar cuando no se pasó el límite", async () => {
    const { default: middleware } = await import("./middleware")

    const res = await middleware(fakeRequest("/api/equipo"))

    expect(res.status).not.toBe(429)
  })

  it.each([
    "/api/auth/registro",
    "/api/cron/recordatorios",
    "/api/reservar/mi-negocio",
    "/api/equipo/invitacion/token-123/aceptar",
  ])("no aplica el límite del panel a %s (tiene el suyo propio, o no corresponde)", async (ruta) => {
    const { default: middleware } = await import("./middleware")

    await middleware(fakeRequest(ruta, "POST"))

    expect(mockVerificarLimite).not.toHaveBeenCalledWith("panelLectura", expect.anything())
    expect(mockVerificarLimite).not.toHaveBeenCalledWith("panelEscritura", expect.anything())
  })

  it("sin sesión, cuenta por IP en vez de romper la petición", async () => {
    const { default: middleware } = await import("./middleware")

    mockGetToken.mockResolvedValueOnce(null)

    await middleware(fakeRequest("/api/pacientes"))

    expect(mockVerificarLimite).toHaveBeenCalledWith("panelLectura", "ip:127.0.0.1")
  })
})
