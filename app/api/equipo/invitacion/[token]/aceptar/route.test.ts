import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { pedidoFalso } from "@/pruebas/pedidos"
import bcrypt from "bcryptjs"
import { createHash } from "node:crypto"

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
    updateMany: vi.fn(),
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

const params = (token = "token-valido") => Promise.resolve({ token })

describe("POST /api/equipo/invitacion/[token]/aceptar", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.$transaction.mockImplementation(async (fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock))
    prismaMock.workerInvitation.updateMany.mockResolvedValue({ count: 1 })
  })

  it("responde 410 si la invitación no existe, venció o ya fue aceptada", async () => {
    const { POST } = await import("./route")

    prismaMock.workerInvitation.findUnique.mockResolvedValueOnce(null)
    const res1 = await POST(pedidoFalso({ contrasena: "cualquiera1" }), { params: params() })
    expect(res1.status).toBe(410)

    prismaMock.workerInvitation.findUnique.mockResolvedValueOnce({
      ...invitacionBase,
      acceptedAt: new Date(),
    })
    const res2 = await POST(pedidoFalso({ contrasena: "cualquiera1" }), { params: params() })
    expect(res2.status).toBe(410)

    prismaMock.workerInvitation.findUnique.mockResolvedValueOnce({
      ...invitacionBase,
      expiresAt: new Date(Date.now() - 1000),
    })
    const res3 = await POST(pedidoFalso({ contrasena: "cualquiera1" }), { params: params() })
    expect(res3.status).toBe(410)
  })

  it("busca la invitación por el hash del token del enlace", async () => {
    const { POST } = await import("./route")

    prismaMock.workerInvitation.findUnique.mockResolvedValueOnce(null)
    await POST(pedidoFalso({ contrasena: "cualquiera1" }), { params: params() })

    expect(prismaMock.workerInvitation.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: createHash("sha256").update("token-valido").digest("hex") } })
    )
  })

  describe("un solo uso", () => {
    // Las implementaciones de acá son permanentes: no pueden filtrarse a los
    // demás tests, que usan las de una sola vez.
    afterEach(() => {
      prismaMock.workerInvitation.findUnique.mockReset()
      prismaMock.workerInvitation.update.mockReset()
      prismaMock.workerInvitation.updateMany.mockReset()
      prismaMock.user.findFirst.mockReset()
      prismaMock.user.create.mockReset()
      prismaMock.businessMember.findUnique.mockReset()
      mockGetServerSession.mockReset()
    })
    /**
     * La invitación vive en memoria: `findUnique` devuelve cómo está ahora y
     * `updateMany` con `acceptedAt: null` es atómico, como en Postgres (el
     * segundo UPDATE espera el bloqueo de fila y vuelve a evaluar el WHERE).
     */
    function invitacionEnMemoria() {
      const fila = { ...invitacionBase, acceptedAt: null as Date | null }
      prismaMock.workerInvitation.findUnique.mockImplementation(async () => ({ ...fila }))
      prismaMock.workerInvitation.update.mockImplementation(async ({ data }: { data: { acceptedAt: Date } }) => {
        fila.acceptedAt = data.acceptedAt
        return fila
      })
      prismaMock.workerInvitation.updateMany.mockImplementation(
        async ({ where, data }: { where: { id: string; acceptedAt: null }; data: { acceptedAt: Date } }) => {
          if (where.id !== fila.id || fila.acceptedAt !== where.acceptedAt) return { count: 0 }
          fila.acceptedAt = data.acceptedAt
          return { count: 1 }
        }
      )
      return fila
    }

    it("aceptar dos veces a la vez con cuenta nueva: una vale y la otra falla, y se crea un solo usuario", async () => {
      const { POST } = await import("./route")
      invitacionEnMemoria()
      prismaMock.user.findFirst.mockResolvedValue(null)
      prismaMock.user.create.mockResolvedValue({ id: "user-nuevo", email: invitacionBase.email })

      const [a, b] = await Promise.all([
        POST(pedidoFalso({ contrasena: "unaClaveSegura1" }), { params: params() }),
        POST(pedidoFalso({ contrasena: "otraClaveSegura1" }), { params: params() }),
      ])

      expect([a.status, b.status].sort()).toEqual([200, 410])
      expect(prismaMock.user.create).toHaveBeenCalledTimes(1)
      expect(prismaMock.businessMember.create).toHaveBeenCalledTimes(1)
    })

    it("aceptar dos veces a la vez con la cuenta existente: una vale y la otra falla", async () => {
      const { POST } = await import("./route")
      invitacionEnMemoria()
      prismaMock.user.findFirst.mockResolvedValue(cuentaExistente)
      prismaMock.businessMember.findUnique.mockResolvedValue(null)
      mockGetServerSession.mockResolvedValue({ user: { id: cuentaExistente.id, email: cuentaExistente.email } })

      const [a, b] = await Promise.all([
        POST(pedidoFalso({}), { params: params() }),
        POST(pedidoFalso({}), { params: params() }),
      ])

      expect([a.status, b.status].sort()).toEqual([200, 410])
      expect(prismaMock.businessMember.create).toHaveBeenCalledTimes(1)
    })

    it("aceptar una invitación ya aceptada falla con 410", async () => {
      const { POST } = await import("./route")
      const fila = invitacionEnMemoria()
      prismaMock.user.findFirst.mockResolvedValue(null)
      prismaMock.user.create.mockResolvedValue({ id: "user-nuevo", email: invitacionBase.email })

      const primera = await POST(pedidoFalso({ contrasena: "unaClaveSegura1" }), { params: params() })
      const segunda = await POST(pedidoFalso({ contrasena: "unaClaveSegura1" }), { params: params() })

      expect(primera.status).toBe(200)
      expect(fila.acceptedAt).toBeInstanceOf(Date)
      expect(segunda.status).toBe(410)
    })
  })

  it("email sin cuenta: crea el usuario con la contraseña elegida y la membresía", async () => {
    const { POST } = await import("./route")

    prismaMock.workerInvitation.findUnique.mockResolvedValueOnce(invitacionBase)
    prismaMock.user.findFirst.mockResolvedValueOnce(null)
    prismaMock.user.create.mockResolvedValueOnce({ id: "user-nuevo", email: invitacionBase.email })

    const res = await POST(pedidoFalso({ contrasena: "unaClaveSegura1" }), { params: params() })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toMatchObject({ ok: true, cuentaNueva: true })
    expect(prismaMock.user.create).toHaveBeenCalledTimes(1)
    // Lo que se guarda es el hash de la contraseña que eligió, no otra cosa.
    const hashGuardado = prismaMock.user.create.mock.calls[0][0].data.password
    expect(await bcrypt.compare("unaClaveSegura1", hashGuardado)).toBe(true)
    expect(prismaMock.businessMember.create).toHaveBeenCalledWith({
      data: { businessId: invitacionBase.businessId, userId: "user-nuevo", role: invitacionBase.role },
    })
    expect(prismaMock.workerInvitation.updateMany).toHaveBeenCalledWith({
      where: { id: invitacionBase.id, acceptedAt: null, expiresAt: { gt: expect.any(Date) } },
      data: { acceptedAt: expect.any(Date) },
    })
  })

  it("la cuenta nueva se crea con el email normalizado, aunque la invitación sea de antes de normalizar", async () => {
    const { POST } = await import("./route")

    prismaMock.workerInvitation.findUnique.mockResolvedValueOnce({ ...invitacionBase, email: " Carla@Uno.TEST " })
    prismaMock.user.findFirst.mockResolvedValueOnce(null)
    prismaMock.user.create.mockResolvedValueOnce({ id: "user-nuevo", email: "carla@uno.test" })

    const res = await POST(pedidoFalso({ contrasena: "unaClaveSegura1" }), { params: params() })

    expect(res.status).toBe(200)
    expect(prismaMock.user.create.mock.calls[0][0].data.email).toBe("carla@uno.test")
  })

  it.each([
    ["73 caracteres", "a".repeat(73)],
    ["40 eñes: 40 caracteres pero 80 bytes", "ñ".repeat(40)],
  ])("una contraseña de más de 72 bytes (%s) se rechaza con 400 y no se crea nada", async (_caso, contrasena) => {
    const { POST } = await import("./route")

    // El cuerpo se valida antes de buscar la cuenta: no hace falta preparar `findFirst`.
    prismaMock.workerInvitation.findUnique.mockResolvedValueOnce(invitacionBase)

    const res = await POST(pedidoFalso({ contrasena }), { params: params() })

    expect(res.status).toBe(400)
    expect(prismaMock.user.create).not.toHaveBeenCalled()
    expect(prismaMock.workerInvitation.updateMany).not.toHaveBeenCalled()
  })

  it("la contraseña viaja como `contrasena`, igual que en el registro: con la clave vieja no se crea nada", async () => {
    const { POST } = await import("./route")

    prismaMock.workerInvitation.findUnique.mockResolvedValueOnce(invitacionBase)
    prismaMock.user.findFirst.mockResolvedValueOnce(null)

    const res = await POST(pedidoFalso({ password: "unaClaveSegura1" }), { params: params() })

    expect(res.status).toBe(400)
    expect(prismaMock.user.create).not.toHaveBeenCalled()
    expect(prismaMock.businessMember.create).not.toHaveBeenCalled()
    expect(prismaMock.workerInvitation.updateMany).not.toHaveBeenCalled()
  })

  it("la cuenta existente se reconoce aunque el correo venga con otras mayúsculas", async () => {
    const { POST } = await import("./route")

    prismaMock.workerInvitation.findUnique.mockResolvedValueOnce(invitacionBase)
    prismaMock.user.findFirst.mockResolvedValueOnce({
      ...cuentaExistente,
      email: cuentaExistente.email.toUpperCase(),
    })
    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await POST(pedidoFalso({ contrasena: "loQueElijaElAtacante1" }), { params: params() })

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

    const res = await POST(pedidoFalso({ contrasena: "loQueElijaElAtacante1" }), { params: params() })
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data.requiereSesion).toBe(true)
    expect(prismaMock.user.create).not.toHaveBeenCalled()
    expect(prismaMock.businessMember.create).not.toHaveBeenCalled()
    expect(prismaMock.workerInvitation.updateMany).not.toHaveBeenCalled()
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("email con cuenta existente y sesión de otro correo: no crea nada (el ataque de dos requests)", async () => {
    const { POST } = await import("./route")

    prismaMock.workerInvitation.findUnique.mockResolvedValueOnce(invitacionBase)
    prismaMock.user.findFirst.mockResolvedValueOnce(cuentaExistente)
    // El atacante está logueado con su propia cuenta, no con la de la víctima.
    mockGetServerSession.mockResolvedValueOnce({ user: { id: "user-atacante", email: "atacante@mi-negocio.com" } })

    const res = await POST(pedidoFalso({ contrasena: "loQueElijaElAtacante1" }), { params: params() })
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data.requiereSesion).toBe(true)
    expect(prismaMock.user.create).not.toHaveBeenCalled()
    expect(prismaMock.businessMember.create).not.toHaveBeenCalled()
    expect(prismaMock.workerInvitation.updateMany).not.toHaveBeenCalled()
  })

  it.each([
    ["revocada (sin id)", { id: "", email: cuentaExistente.email }],
    ["de otro usuario con el mismo correo en el token", { id: "user-otro", email: cuentaExistente.email }],
  ])("email con cuenta existente y sesión %s: el correo solo no alcanza, no crea nada", async (_caso, user) => {
    const { POST } = await import("./route")

    prismaMock.workerInvitation.findUnique.mockResolvedValueOnce(invitacionBase)
    prismaMock.user.findFirst.mockResolvedValueOnce(cuentaExistente)
    mockGetServerSession.mockResolvedValueOnce({ user })

    const res = await POST(pedidoFalso({}), { params: params() })
    const data = await res.json()

    expect(res.status).toBe(401)
    expect(data.requiereSesion).toBe(true)
    expect(prismaMock.businessMember.create).not.toHaveBeenCalled()
    expect(prismaMock.workerInvitation.updateMany).not.toHaveBeenCalled()
  })

  it("email con cuenta existente y sesión propia: solo suma la membresía, no toca password ni name", async () => {
    const { POST } = await import("./route")

    prismaMock.workerInvitation.findUnique.mockResolvedValueOnce(invitacionBase)
    prismaMock.user.findFirst.mockResolvedValueOnce(cuentaExistente)
    prismaMock.businessMember.findUnique.mockResolvedValueOnce(null)
    mockGetServerSession.mockResolvedValueOnce({ user: { id: cuentaExistente.id, email: cuentaExistente.email } })

    const res = await POST(pedidoFalso({}), { params: params() })
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
    expect(prismaMock.workerInvitation.updateMany).toHaveBeenCalledWith({
      where: { id: invitacionBase.id, acceptedAt: null, expiresAt: { gt: expect.any(Date) } },
      data: { acceptedAt: expect.any(Date) },
    })
  })
})
