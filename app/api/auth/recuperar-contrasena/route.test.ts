import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"

const mockVerificarLimite = vi.fn()
const mockEnviarRecuperacion = vi.fn()

vi.mock("@/lib/rate-limit", () => ({
  obtenerIp: () => "203.0.113.7",
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
}))

vi.mock("@/lib/email", () => ({
  enviarRecuperacionPassword: (...args: unknown[]) => mockEnviarRecuperacion(...args),
}))

const prismaMock = {
  user: { findUnique: vi.fn() },
  passwordResetToken: { create: vi.fn() },
}

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

const fakeRequest = (body: unknown): NextRequest =>
  ({ json: () => Promise.resolve(body), headers: new Headers() }) as unknown as NextRequest

const usuario = { id: "usuario-1", email: "ana@example.com", name: "Ana", password: "hash" }

describe("POST /api/auth/recuperar-contrasena", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 4 })
    mockEnviarRecuperacion.mockResolvedValue(null)
    prismaMock.user.findUnique.mockResolvedValue(usuario)
    prismaMock.passwordResetToken.create.mockResolvedValue({ token: "token-abc" })
  })

  it("sigue limitado por IP con el límite `auth`: pasado el tope, 429 sin tocar la base ni mandar correos", async () => {
    const { POST } = await import("./route")

    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })

    const res = await POST(fakeRequest({ email: "ana@example.com" }))

    expect(res.status).toBe(429)
    expect(mockVerificarLimite).toHaveBeenCalledWith("auth", "203.0.113.7")
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
    expect(mockEnviarRecuperacion).not.toHaveBeenCalled()
  })

  it("manda un enlace que apunta a la página /restablecer-contrasena/<token>", async () => {
    const { POST } = await import("./route")

    const res = await POST(fakeRequest({ email: "ana@example.com" }))

    expect(res.status).toBe(200)
    expect(mockEnviarRecuperacion).toHaveBeenCalledWith(
      expect.objectContaining({
        emailUsuario: "ana@example.com",
        enlaceRestablecer: expect.stringMatching(/\/restablecer-contrasena\/token-abc$/),
      })
    )
  })

  it("con un correo sin cuenta responde lo mismo que con uno que existe: no revela quién tiene cuenta", async () => {
    const { POST } = await import("./route")

    const conCuenta = await POST(fakeRequest({ email: "ana@example.com" }))
    const cuerpoConCuenta = await conCuenta.json()

    prismaMock.user.findUnique.mockResolvedValueOnce(null)
    const sinCuenta = await POST(fakeRequest({ email: "nadie@example.com" }))

    expect(sinCuenta.status).toBe(conCuenta.status)
    expect(await sinCuenta.json()).toEqual(cuerpoConCuenta)
    // Y a quien no tiene cuenta no se le crea un token ni se le escribe.
    expect(prismaMock.passwordResetToken.create).toHaveBeenCalledTimes(1)
    expect(mockEnviarRecuperacion).toHaveBeenCalledTimes(1)
  })

  it("una cuenta de Google, sin contraseña que restablecer, responde igual y no recibe correo", async () => {
    const { POST } = await import("./route")

    prismaMock.user.findUnique.mockResolvedValueOnce({ ...usuario, password: "" })

    const res = await POST(fakeRequest({ email: "ana@example.com" }))

    expect(res.status).toBe(200)
    expect(mockEnviarRecuperacion).not.toHaveBeenCalled()
  })

  it("rechaza un correo inválido con 400", async () => {
    const { POST } = await import("./route")

    const res = await POST(fakeRequest({ email: "no-es-un-correo" }))

    expect(res.status).toBe(400)
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  })
})
