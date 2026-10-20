import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { pedidoFalso } from "@/pruebas/pedidos"
import { createHash } from "node:crypto"

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
  passwordResetToken: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  user: { update: vi.fn() },
  $transaction: vi.fn(),
}

const correrTransaccion = async (pasos: unknown) =>
  typeof pasos === "function" ? (pasos as (tx: typeof prismaMock) => unknown)(prismaMock) : Promise.all(pasos as unknown[])

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

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
    prismaMock.passwordResetToken.updateMany.mockResolvedValue({ count: 1 })
    prismaMock.$transaction.mockImplementation(correrTransaccion)
  })

  it("sigue limitado por IP con el límite `auth`: pasado el tope, 429 sin tocar la base", async () => {
    const { POST } = await import("./route")

    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })

    const res = await POST(pedidoFalso({ token: "token-abc", contrasena: "nuevaClave1" }))

    expect(res.status).toBe(429)
    expect(mockVerificarLimite).toHaveBeenCalledWith("auth", "203.0.113.7")
    expect(prismaMock.passwordResetToken.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it("la contraseña viaja en `contrasena`: se guarda hasheada y el enlace queda usado", async () => {
    const { POST } = await import("./route")

    const res = await POST(pedidoFalso({ token: "token-abc", contrasena: "nuevaClave1" }))

    expect(res.status).toBe(200)
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: "usuario-1" },
      data: { password: "hash(nuevaClave1)", sesionesValidasDesde: expect.any(Date) },
    })
    expect(prismaMock.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: { id: "enlace-1", usedAt: null, expiresAt: { gt: expect.any(Date) } },
      data: { usedAt: expect.any(Date) },
    })
  })

  it("busca el enlace por el hash del token, no por el token en claro", async () => {
    const { POST } = await import("./route")

    const res = await POST(pedidoFalso({ token: "token-abc", contrasena: "nuevaClave1" }))

    expect(res.status).toBe(200)
    expect(prismaMock.passwordResetToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: createHash("sha256").update("token-abc").digest("hex") },
    })
  })

  it("un enlace de antes del cambio (un cuid) sigue funcionando: la migración guardó su hash", async () => {
    const { POST } = await import("./route")
    const cuid = "clx9k2m8a0000qz8h3f7d2b1c"

    const res = await POST(pedidoFalso({ token: cuid, contrasena: "nuevaClave1" }))

    expect(res.status).toBe(200)
    expect(prismaMock.passwordResetToken.findUnique.mock.calls[0][0].where.tokenHash).toBe(
      createHash("sha256").update(cuid, "utf8").digest("hex")
    )
  })

  it("el cuerpo de antes, con `password`, ya no sirve: 400 y no se toca nada", async () => {
    const { POST } = await import("./route")

    const res = await POST(pedidoFalso({ token: "token-abc", password: "nuevaClave1" }))

    expect(res.status).toBe(400)
    expect(prismaMock.passwordResetToken.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it("una contraseña corta se rechaza con 400", async () => {
    const { POST } = await import("./route")

    const res = await POST(pedidoFalso({ token: "token-abc", contrasena: "corta" }))

    expect(res.status).toBe(400)
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it("un enlace ya usado responde 410 y no cambia la contraseña", async () => {
    const { POST } = await import("./route")

    prismaMock.passwordResetToken.findUnique.mockResolvedValueOnce({ ...enlaceVigente, usedAt: new Date() })

    const res = await POST(pedidoFalso({ token: "token-abc", contrasena: "nuevaClave1" }))

    expect(res.status).toBe(410)
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it("un enlace vencido responde 410 y no cambia la contraseña", async () => {
    const { POST } = await import("./route")

    prismaMock.passwordResetToken.findUnique.mockResolvedValueOnce({
      ...enlaceVigente,
      expiresAt: new Date(Date.now() - 1000),
    })

    const res = await POST(pedidoFalso({ token: "token-abc", contrasena: "nuevaClave1" }))

    expect(res.status).toBe(410)
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })
})

/**
 * Una base en memoria con la semántica que importa acá: `updateMany` con
 * `usedAt: null` es atómico (en Postgres, el segundo `UPDATE` espera el
 * bloqueo de fila y vuelve a evaluar el `WHERE`), y la transacción corre el
 * callback contra la misma base.
 */
function baseDeEnlaces() {
  const enlaces = [
    { ...enlaceVigente },
    { id: "enlace-2", userId: "usuario-1", usedAt: null as Date | null, expiresAt: enlaceVigente.expiresAt },
    { id: "enlace-ajeno", userId: "usuario-2", usedAt: null as Date | null, expiresAt: enlaceVigente.expiresAt },
  ]
  const usuario: { password: string; sesionesValidasDesde: Date | null } = { password: "vieja", sesionesValidasDesde: null }
  const cumple = (enlace: (typeof enlaces)[number], where: Record<string, unknown>) =>
    Object.entries(where).every(([campo, valor]) => {
      if (campo === "expiresAt") return enlace.expiresAt > (valor as { gt: Date }).gt
      return (enlace as Record<string, unknown>)[campo] === valor
    })
  const passwordResetToken = {
    findUnique: vi.fn(async () => ({ ...enlaces[0] })),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: { usedAt: Date } }) => {
      const enlace = enlaces.find((e) => e.id === where.id)!
      enlace.usedAt = data.usedAt
      return enlace
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: { usedAt: Date } }) => {
      const elegidos = enlaces.filter((e) => cumple(e, where))
      elegidos.forEach((e) => (e.usedAt = data.usedAt))
      return { count: elegidos.length }
    }),
  }
  const user = {
    update: vi.fn(async ({ data }: { data: Partial<typeof usuario> }) => Object.assign(usuario, data)),
  }
  const cliente = { passwordResetToken, user }
  const transaccion = vi.fn(async (pasos: unknown) =>
    typeof pasos === "function" ? (pasos as (tx: typeof cliente) => unknown)(cliente) : Promise.all(pasos as unknown[])
  )
  return { enlaces, usuario, cliente, transaccion }
}

describe("POST /api/auth/restablecer-contrasena: un solo uso y cierre de sesiones", () => {
  const originales = { ...prismaMock, passwordResetToken: { ...prismaMock.passwordResetToken }, user: { ...prismaMock.user } }

  beforeEach(() => {
    vi.clearAllMocks()
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 4 })
    mockHash.mockImplementation(async (valor: string) => `hash(${valor})`)
  })

  afterEach(() => {
    Object.assign(prismaMock.passwordResetToken, originales.passwordResetToken)
    Object.assign(prismaMock.user, originales.user)
    prismaMock.$transaction = originales.$transaction
  })

  function usarBase() {
    const base = baseDeEnlaces()
    Object.assign(prismaMock.passwordResetToken, base.cliente.passwordResetToken)
    Object.assign(prismaMock.user, base.cliente.user)
    prismaMock.$transaction = base.transaccion as never
    return base
  }

  it("dos usos simultáneos del mismo enlace: uno 200 y el otro 410", async () => {
    const { POST } = await import("./route")
    const base = usarBase()

    const [a, b] = await Promise.all([
      POST(pedidoFalso({ token: "token-abc", contrasena: "claveDelPrimero1" })),
      POST(pedidoFalso({ token: "token-abc", contrasena: "claveDelSegundo1" })),
    ])

    expect([a.status, b.status].sort()).toEqual([200, 410])
    // Quedó la contraseña del que respondió 200, no la del que perdió la carrera.
    expect(base.usuario.password).toBe(a.status === 200 ? "hash(claveDelPrimero1)" : "hash(claveDelSegundo1)")
  })

  it("cierra las sesiones previas y anula los demás enlaces pendientes del usuario, no los de otro", async () => {
    const { POST } = await import("./route")
    const base = usarBase()

    const res = await POST(pedidoFalso({ token: "token-abc", contrasena: "nuevaClave1" }))

    expect(res.status).toBe(200)
    expect(base.usuario.sesionesValidasDesde).toBeInstanceOf(Date)
    expect(base.enlaces.find((e) => e.id === "enlace-2")!.usedAt).toBeInstanceOf(Date)
    expect(base.enlaces.find((e) => e.id === "enlace-ajeno")!.usedAt).toBeNull()
  })
})
