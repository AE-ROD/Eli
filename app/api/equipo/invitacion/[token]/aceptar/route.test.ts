import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

vi.mock("@/lib/rate-limit", () => ({
  obtenerIp: () => "127.0.0.1",
  verificarLimite: async () => ({ permitido: true }),
}))

const prismaMock = {
  workerInvitation: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  user: {
    findFirst: vi.fn(),
    create: vi.fn(),
    // Presente a propósito: si alguien reintroduce el update que pisaba la
    // contraseña, los tests lo ven en vez de fallar por un mock inexistente.
    update: vi.fn(),
  },
  businessMember: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  $transaction: vi.fn(async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock)),
}

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

// La invitación "de ataque": alguien invita a un correo que ya tiene cuenta
// en otro negocio.
const invitacionBase = {
  id: "inv-1",
  businessId: "negocio-atacante",
  email: "dueño@otro-negocio.com",
  name: "Nombre que eligió el atacante",
  role: "worker",
  token: "token-valido",
  expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  acceptedAt: null,
  createdAt: new Date(),
}

const cuentaExistente = {
  id: "user-victima",
  name: "Dueño Real",
  email: "dueño@otro-negocio.com",
  password: "hash-original-de-la-victima",
}

const fakeRequest = (body: unknown): NextRequest =>
  ({
    headers: new Headers(),
    json: async () => body,
  }) as unknown as NextRequest

const params = (token = "token-valido") => Promise.resolve({ token })

describe("POST /api/equipo/invitacion/[token]/aceptar", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock))
  })

  it("responde 410 si la invitación no existe, venció o ya fue aceptada", async () => {
    const { POST } = await import("./route")

    prismaMock.workerInvitation.findUnique.mockResolvedValueOnce(null)
    const res1 = await POST(fakeRequest({ password: "cualquiera1" }), { params: params() })
    expect(res1.status).toBe(410)

    prismaMock.workerInvitation.findUnique.mockResolvedValueOnce({
      ...invitacionBase,
      acceptedAt: new Date(),
    })
    const res2 = await POST(fakeRequest({ password: "cualquiera1" }), { params: params() })
    expect(res2.status).toBe(410)

    prismaMock.workerInvitation.findUnique.mockResolvedValueOnce({
      ...invitacionBase,
      expiresAt: new Date(Date.now() - 1000),
    })
    const res3 = await POST(fakeRequest({ password: "cualquiera1" }), { params: params() })
    expect(res3.status).toBe(410)
  })

  it("email sin cuenta: crea el usuario con la contraseña elegida y la membresía", async () => {
    const { POST } = await import("./route")

    prismaMock.workerInvitation.findUnique.mockResolvedValueOnce(invitacionBase)
    prismaMock.user.findFirst.mockResolvedValueOnce(null)
    prismaMock.user.create.mockResolvedValueOnce({ id: "user-nuevo", email: invitacionBase.email })

    const res = await POST(fakeRequest({ password: "unaClaveSegura1" }), { params: params() })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toMatchObject({ ok: true, cuentaNueva: true })
    expect(prismaMock.user.create).toHaveBeenCalledTimes(1)
    expect(prismaMock.businessMember.create).toHaveBeenCalledWith({
      data: { businessId: invitacionBase.businessId, userId: "user-nuevo", role: invitacionBase.role },
    })
    expect(prismaMock.workerInvitation.update).toHaveBeenCalledWith({
      where: { id: invitacionBase.id },
      data: { acceptedAt: expect.any(Date) },
    })
  })

  it("la cuenta existente se reconoce aunque el correo venga con otras mayúsculas", async () => {
    const { POST } = await import("./route")

    prismaMock.workerInvitation.findUnique.mockResolvedValueOnce(invitacionBase)
    prismaMock.user.findFirst.mockResolvedValueOnce({
      ...cuentaExistente,
      email: cuentaExistente.email.toUpperCase(),
    })
    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await POST(fakeRequest({ password: "loQueElijaElAtacante1" }), { params: params() })

    // Sin este reconocimiento caería al camino de cuenta nueva y crearía una
    // segunda cuenta para la misma persona, con el nombre que eligió el que invita.
    expect(res.status).toBe(401)
    expect(prismaMock.user.create).not.toHaveBeenCalled()
    expect(prismaMock.user.update).not.toHaveBeenCalled()
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: invitacionBase.email, mode: "insensitive" } },
    })
  })

  it("email con cuenta existente y sin sesión: no crea nada y pide iniciar sesión", async () => {
    const { POST } = await import("./route")

    prismaMock.workerInvitation.findUnique.mockResolvedValueOnce(invitacionBase)
    prismaMock.user.findFirst.mockResolvedValueOnce(cuentaExistente)
    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await POST(fakeRequest({ password: "loQueElijaElAtacante1" }), { params: params() })
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data.requiereSesion).toBe(true)
    expect(prismaMock.user.create).not.toHaveBeenCalled()
    expect(prismaMock.businessMember.create).not.toHaveBeenCalled()
    expect(prismaMock.workerInvitation.update).not.toHaveBeenCalled()
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("email con cuenta existente y sesión de otro correo: no crea nada (el ataque de dos requests)", async () => {
    const { POST } = await import("./route")

    prismaMock.workerInvitation.findUnique.mockResolvedValueOnce(invitacionBase)
    prismaMock.user.findFirst.mockResolvedValueOnce(cuentaExistente)
    // El atacante está logueado con su propia cuenta, no con la de la víctima.
    mockGetServerSession.mockResolvedValueOnce({ user: { email: "atacante@mi-negocio.com" } })

    const res = await POST(fakeRequest({ password: "loQueElijaElAtacante1" }), { params: params() })
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data.requiereSesion).toBe(true)
    expect(prismaMock.user.create).not.toHaveBeenCalled()
    expect(prismaMock.businessMember.create).not.toHaveBeenCalled()
    expect(prismaMock.workerInvitation.update).not.toHaveBeenCalled()
  })

  it("email con cuenta existente y sesión propia: solo suma la membresía, no toca password ni name", async () => {
    const { POST } = await import("./route")

    prismaMock.workerInvitation.findUnique.mockResolvedValueOnce(invitacionBase)
    prismaMock.user.findFirst.mockResolvedValueOnce(cuentaExistente)
    prismaMock.businessMember.findUnique.mockResolvedValueOnce(null)
    mockGetServerSession.mockResolvedValueOnce({ user: { email: cuentaExistente.email } })

    const res = await POST(fakeRequest({}), { params: params() })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toMatchObject({ ok: true, cuentaNueva: false, email: cuentaExistente.email })
    expect(prismaMock.user.create).not.toHaveBeenCalled()
    // Lo que sostiene toda la ficha: ni siquiera en el camino feliz se escribe
    // sobre la cuenta que ya existía.
    expect(prismaMock.user.update).not.toHaveBeenCalled()
    expect(prismaMock.businessMember.create).toHaveBeenCalledWith({
      data: { businessId: invitacionBase.businessId, userId: cuentaExistente.id, role: invitacionBase.role },
    })
    expect(prismaMock.workerInvitation.update).toHaveBeenCalledWith({
      where: { id: invitacionBase.id },
      data: { acceptedAt: expect.any(Date) },
    })
  })
})
