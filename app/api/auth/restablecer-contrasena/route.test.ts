import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"

const mockVerificarLimite = vi.fn()
const mockHash = vi.fn()

vi.mock("@/lib/rate-limit", () => ({
  obtenerIp: () => "203.0.113.7",
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
}))

vi.mock("bcryptjs", () => ({
  default: { hash: (...args: unknown[]) => mockHash(...args) },
}))

const prismaMock = {
  passwordResetToken: { findUnique: vi.fn(), update: vi.fn() },
  user: { update: vi.fn() },
  $transaction: vi.fn(),
}

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

const fakeRequest = (body: unknown): NextRequest =>
  ({ json: () => Promise.resolve(body), headers: new Headers() }) as unknown as NextRequest

const enlaceVigente = {
  id: "enlace-1",
  userId: "usuario-1",
  token: "token-abc",
  usedAt: null,
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
}

describe("POST /api/auth/restablecer-contrasena", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 4 })
    mockHash.mockImplementation(async (valor: string) => `hash(${valor})`)
    prismaMock.passwordResetToken.findUnique.mockResolvedValue(enlaceVigente)
    prismaMock.$transaction.mockResolvedValue([])
  })

  it("sigue limitado por IP con el límite `auth`: pasado el tope, 429 sin tocar la base", async () => {
    const { POST } = await import("./route")

    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })

    const res = await POST(fakeRequest({ token: "token-abc", contrasena: "nuevaClave1" }))

    expect(res.status).toBe(429)
    expect(mockVerificarLimite).toHaveBeenCalledWith("auth", "203.0.113.7")
    expect(prismaMock.passwordResetToken.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it("la contraseña viaja en `contrasena`: se guarda hasheada y el enlace queda usado", async () => {
    const { POST } = await import("./route")

    const res = await POST(fakeRequest({ token: "token-abc", contrasena: "nuevaClave1" }))

    expect(res.status).toBe(200)
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "usuario-1" },
      data: { password: "hash(nuevaClave1)" },
    })
    expect(prismaMock.passwordResetToken.update).toHaveBeenCalledWith({
      where: { id: "enlace-1" },
      data: { usedAt: expect.any(Date) },
    })
  })

  it("el cuerpo de antes, con `password`, ya no sirve: 400 y no se toca nada", async () => {
    const { POST } = await import("./route")

    const res = await POST(fakeRequest({ token: "token-abc", password: "nuevaClave1" }))

    expect(res.status).toBe(400)
    expect(prismaMock.passwordResetToken.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it("una contraseña corta se rechaza con 400", async () => {
    const { POST } = await import("./route")

    const res = await POST(fakeRequest({ token: "token-abc", contrasena: "corta" }))

    expect(res.status).toBe(400)
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it("un enlace ya usado responde 410 y no cambia la contraseña", async () => {
    const { POST } = await import("./route")

    prismaMock.passwordResetToken.findUnique.mockResolvedValueOnce({ ...enlaceVigente, usedAt: new Date() })

    const res = await POST(fakeRequest({ token: "token-abc", contrasena: "nuevaClave1" }))

    expect(res.status).toBe(410)
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it("un enlace vencido responde 410 y no cambia la contraseña", async () => {
    const { POST } = await import("./route")

    prismaMock.passwordResetToken.findUnique.mockResolvedValueOnce({
      ...enlaceVigente,
      expiresAt: new Date(Date.now() - 1000),
    })

    const res = await POST(fakeRequest({ token: "token-abc", contrasena: "nuevaClave1" }))

    expect(res.status).toBe(410)
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })
})
