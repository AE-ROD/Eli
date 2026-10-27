import { describe, it, expect, vi, beforeEach } from "vitest"
import { pedidoFalso } from "@/pruebas/pedidos"
import { createHash } from "node:crypto"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

vi.mock("@/lib/email", () => ({
  enviarInvitacionTrabajador: vi.fn().mockResolvedValue(undefined),
}))

const mockVerificarLimite = vi.fn(async (..._args: unknown[]) => ({ permitido: true, restantes: 2 }))
vi.mock("@/lib/rate-limit", () => ({
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
}))

const prismaMock = {
  businessMember: { findMany: vi.fn() },
  workerInvitation: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  user: { findFirst: vi.fn() },
  business: { findUnique: vi.fn() },
}

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

const sesionDueño = {
  user: { id: "owner-1", role: "owner", businessId: "negocio-1", businessName: "Mi negocio" },
}

const sesionEncargado = {
  user: { id: "admin-1", role: "admin", businessId: "negocio-1", businessName: "Mi negocio", memberId: "member-admin-1" },
}

const sesionProfesional = {
  user: { id: "worker-1", role: "worker", businessId: "negocio-1", businessName: "Mi negocio", memberId: "member-worker-1" },
}

// Segundo negocio, sin relación con "negocio-1": si un handler hardcodeara
// businessId: "negocio-1" en vez de leerlo del actor, estos tests fallarían.
const sesionEncargadoNegocio2 = {
  user: { id: "admin-2", role: "admin", businessId: "negocio-2", businessName: "Otro negocio", memberId: "member-admin-2" },
}

describe("GET /api/equipo", () => {
  beforeEach(() => vi.clearAllMocks())

  it("usa select explícito y no puede filtrar el token de una invitación", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    prismaMock.businessMember.findMany.mockResolvedValueOnce([])
    prismaMock.workerInvitation.findMany.mockResolvedValueOnce([
      { id: "inv-1", name: "Juan", email: "juan@x.com", role: "worker", expiresAt: new Date(), createdAt: new Date() },
    ])

    const res = await GET()
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.invitaciones[0]).not.toHaveProperty("token")

    // La consulta a Prisma nunca pidió el campo token.
    const argumentos = prismaMock.workerInvitation.findMany.mock.calls[0][0]
    expect(argumentos.select).toBeDefined()
    expect(argumentos.select.token).toBeUndefined()
  })

  it("un encargado (admin) recibe 200 y ve los datos de su negocio", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)
    prismaMock.businessMember.findMany.mockResolvedValueOnce([])
    prismaMock.workerInvitation.findMany.mockResolvedValueOnce([])

    const res = await GET()

    expect(res.status).toBe(200)
  })

  it("las dos consultas quedan acotadas por el businessId del actor", async () => {
    const { GET } = await import("./route")

    // Sesión de un negocio distinto al resto del archivo: si el handler
    // hardcodeara "negocio-1" en el where, esta aserción lo detectaría.
    mockGetServerSession.mockResolvedValueOnce(sesionEncargadoNegocio2)
    prismaMock.businessMember.findMany.mockResolvedValueOnce([])
    prismaMock.workerInvitation.findMany.mockResolvedValueOnce([])

    await GET()

    const argumentosMiembros = prismaMock.businessMember.findMany.mock.calls[0][0]
    const argumentosInvitaciones = prismaMock.workerInvitation.findMany.mock.calls[0][0]

    expect(argumentosMiembros.where.businessId).toBe("negocio-2")
    expect(argumentosInvitaciones.where.businessId).toBe("negocio-2")
  })

  it("un profesional (worker) recibe 401", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await GET()

    expect(res.status).toBe(401)
    expect(prismaMock.businessMember.findMany).not.toHaveBeenCalled()
  })

  it("sin sesión recibe 401", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await GET()

    expect(res.status).toBe(401)
  })
})

describe("POST /api/equipo", () => {
  beforeEach(() => vi.clearAllMocks())

  it("nunca devuelve el token de la invitación creada", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    prismaMock.user.findFirst.mockResolvedValueOnce(null)
    prismaMock.workerInvitation.findFirst.mockResolvedValueOnce(null)
    prismaMock.workerInvitation.create.mockResolvedValueOnce({
      id: "inv-2",
      name: "Ana",
      email: "ana@x.com",
      role: "worker",
      expiresAt: new Date(),
      createdAt: new Date(),
      token: "token-secreto",
    })
    prismaMock.business.findUnique.mockResolvedValueOnce({ name: "Mi negocio" })

    const res = await POST(pedidoFalso({ nombre: "Ana", email: "ana@x.com", rol: "worker" }))
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data.invitacion).not.toHaveProperty("token")
    expect(JSON.stringify(data)).not.toContain("token-secreto")
  })

  it("guarda sólo el hash del token; el token en claro va únicamente en el enlace del correo", async () => {
    const { POST } = await import("./route")
    const { enviarInvitacionTrabajador } = await import("@/lib/email")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    prismaMock.user.findFirst.mockResolvedValueOnce(null)
    prismaMock.workerInvitation.findFirst.mockResolvedValueOnce(null)
    prismaMock.workerInvitation.create.mockResolvedValueOnce({
      id: "inv-2",
      name: "Ana",
      email: "ana@x.com",
      role: "worker",
      expiresAt: new Date(),
      createdAt: new Date(),
    })
    prismaMock.business.findUnique.mockResolvedValueOnce({ name: "Mi negocio" })

    const res = await POST(pedidoFalso({ nombre: "Ana", email: "ana@x.com", rol: "worker" }))

    expect(res.status).toBe(201)
    const enlace: string = vi.mocked(enviarInvitacionTrabajador).mock.calls[0][0].enlaceAceptar
    const tokenDelEnlace = enlace.split("/unirse/")[1]
    const argumentosCrear = prismaMock.workerInvitation.create.mock.calls[0][0]

    expect(tokenDelEnlace).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(argumentosCrear.data.tokenHash).toBe(createHash("sha256").update(tokenDelEnlace).digest("hex"))
    expect(JSON.stringify(argumentosCrear)).not.toContain(tokenDelEnlace)
    // Ni siquiera el hash se pide de vuelta: no hay forma de que llegue a la respuesta.
    expect(argumentosCrear.select.tokenHash).toBeUndefined()
    expect(JSON.stringify(await res.json())).not.toContain(tokenDelEnlace)
  })

  it("un encargado (admin) puede invitar", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)
    prismaMock.user.findFirst.mockResolvedValueOnce(null)
    prismaMock.workerInvitation.findFirst.mockResolvedValueOnce(null)
    prismaMock.workerInvitation.create.mockResolvedValueOnce({
      id: "inv-3",
      name: "Ana",
      email: "ana@x.com",
      role: "worker",
      expiresAt: new Date(),
      createdAt: new Date(),
      token: "token-secreto",
    })
    prismaMock.business.findUnique.mockResolvedValueOnce({ name: "Mi negocio" })

    const res = await POST(pedidoFalso({ nombre: "Ana", email: "ana@x.com", rol: "worker" }))

    expect(res.status).toBe(201)
  })

  it("las cuatro consultas quedan acotadas por el businessId del actor", async () => {
    const { POST } = await import("./route")

    // Mismo criterio que en el GET: negocio distinto al resto del archivo
    // para que un businessId hardcodeado se note.
    mockGetServerSession.mockResolvedValueOnce(sesionEncargadoNegocio2)
    prismaMock.user.findFirst.mockResolvedValueOnce(null)
    prismaMock.workerInvitation.findFirst.mockResolvedValueOnce(null)
    prismaMock.workerInvitation.create.mockResolvedValueOnce({
      id: "inv-4",
      name: "Ana",
      email: "ana@x.com",
      role: "worker",
      expiresAt: new Date(),
      createdAt: new Date(),
      token: "token-secreto",
    })
    prismaMock.business.findUnique.mockResolvedValueOnce({ name: "Otro negocio" })

    const res = await POST(pedidoFalso({ nombre: "Ana", email: "ana@x.com", rol: "worker" }))
    expect(res.status).toBe(201)

    const argumentosUsuario = prismaMock.user.findFirst.mock.calls[0][0]
    const argumentosInvitacionPendiente = prismaMock.workerInvitation.findFirst.mock.calls[0][0]
    const argumentosCrear = prismaMock.workerInvitation.create.mock.calls[0][0]
    const argumentosNegocio = prismaMock.business.findUnique.mock.calls[0][0]

    expect(argumentosUsuario.include.memberships.where.businessId).toBe("negocio-2")
    expect(argumentosInvitacionPendiente.where.businessId).toBe("negocio-2")
    expect(argumentosCrear.data.businessId).toBe("negocio-2")
    expect(argumentosNegocio.where.id).toBe("negocio-2")
  })

  it("un profesional (worker) recibe 401 y no llega a invitar", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await POST(pedidoFalso({ nombre: "Ana", email: "ana@x.com", rol: "worker" }))

    expect(res.status).toBe(401)
    expect(prismaMock.workerInvitation.create).not.toHaveBeenCalled()
  })

  it("sin sesión recibe 401", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await POST(pedidoFalso({ nombre: "Ana", email: "ana@x.com", rol: "worker" }))

    expect(res.status).toBe(401)
  })
})

describe("POST /api/equipo — largos", () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([
    ["un nombre de 101 caracteres", { nombre: "a".repeat(101), email: "ana@x.com" }, "El nombre no puede tener más de 100 caracteres"],
    ["un nombre de puros espacios", { nombre: "    ", email: "ana@x.com" }, "El nombre tiene que tener al menos 2 caracteres"],
    ["un email de 255 caracteres", { nombre: "Ana", email: `${"a".repeat(249)}@x.com` }, "El email no puede tener más de 254 caracteres"],
    ["un email que no es email", { nombre: "Ana", email: "ana" }, "El email no es válido"],
    ["un rol que no existe", { nombre: "Ana", email: "ana@x.com", rol: "owner" }, "Datos inválidos"],
  ])("rechaza %s: 400 con un error legible y no invita", async (_caso, cuerpo, mensaje) => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const res = await POST(pedidoFalso(cuerpo))

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: mensaje })
    expect(prismaMock.workerInvitation.create).not.toHaveBeenCalled()
  })

  it("guarda el nombre y el email sin los espacios de las puntas", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    prismaMock.user.findFirst.mockResolvedValueOnce(null)
    prismaMock.workerInvitation.findFirst.mockResolvedValueOnce(null)
    prismaMock.workerInvitation.create.mockResolvedValueOnce({ id: "inv-9", token: "t" })
    prismaMock.business.findUnique.mockResolvedValueOnce({ name: "Mi negocio" })

    const res = await POST(pedidoFalso({ nombre: "  Ana  ", email: "  ana@x.com  " }))

    expect(res.status).toBe(201)
    expect(prismaMock.workerInvitation.create.mock.calls[0][0].data).toMatchObject({ name: "Ana", email: "ana@x.com" })
  })

  it("guarda el email de la invitación en minúsculas: es el de la cuenta que se va a crear", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    prismaMock.user.findFirst.mockResolvedValueOnce(null)
    prismaMock.workerInvitation.findFirst.mockResolvedValueOnce(null)
    prismaMock.workerInvitation.create.mockResolvedValueOnce({ id: "inv-10" })
    prismaMock.business.findUnique.mockResolvedValueOnce({ name: "Mi negocio" })

    const res = await POST(pedidoFalso({ nombre: "Ana", email: " Ana.Perez@X.COM " }))

    expect(res.status).toBe(201)
    expect(prismaMock.workerInvitation.create.mock.calls[0][0].data.email).toBe("ana.perez@x.com")
  })
})

describe("POST /api/equipo — errores internos", () => {
  beforeEach(() => vi.clearAllMocks())

  it("un error de Prisma responde 500 y en el log sólo quedan su nombre y su código, sin datos", async () => {
    const { POST } = await import("./route")
    const log = vi.spyOn(console, "error").mockImplementation(() => {})

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    prismaMock.user.findFirst.mockRejectedValueOnce(
      Object.assign(new Error("Invalid `prisma.user.findFirst()` where email = ana@x.com"), {
        name: "PrismaClientKnownRequestError",
        code: "P2010",
        meta: { email: "ana@x.com" },
      })
    )

    const res = await POST(pedidoFalso({ nombre: "Ana", email: "ana@x.com", rol: "worker" }))

    expect(res.status).toBe(500)
    expect(log).toHaveBeenCalledWith(expect.any(String), { name: "PrismaClientKnownRequestError", code: "P2010" })
    expect(JSON.stringify(log.mock.calls)).not.toContain("ana@x.com")
    log.mockRestore()
  })
})

describe("POST /api/equipo — una invitación anterior sin aceptar", () => {
  beforeEach(() => vi.clearAllMocks())

  const DIA = 24 * 60 * 60 * 1000

  it("si está vigente no manda otra: 409, y el error ofrece reenviarla con su id", async () => {
    const { POST } = await import("./route")
    const { enviarInvitacionTrabajador } = await import("@/lib/email")

    const vence = new Date(Date.now() + 3 * DIA)
    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    prismaMock.user.findFirst.mockResolvedValueOnce(null)
    prismaMock.workerInvitation.findFirst.mockResolvedValueOnce({ id: "inv-vigente", expiresAt: vence, createdAt: new Date() })

    const res = await POST(pedidoFalso({ nombre: "Ana", email: "ana@x.com", rol: "worker" }))
    const data = await res.json()

    expect(res.status).toBe(409)
    expect(data).toEqual({
      error: "Ya hay una invitación vigente para este correo. Puedes reenviarla.",
      invitacionId: "inv-vigente",
      expiresAt: vence.toISOString(),
    })
    expect(prismaMock.workerInvitation.create).not.toHaveBeenCalled()
    expect(prismaMock.workerInvitation.updateMany).not.toHaveBeenCalled()
    expect(enviarInvitacionTrabajador).not.toHaveBeenCalled()
  })

  it("si está vencida la reemplaza: la misma fila, con enlace, vencimiento, nombre y rol nuevos, y manda el correo", async () => {
    const { POST } = await import("./route")
    const { enviarInvitacionTrabajador } = await import("@/lib/email")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargadoNegocio2)
    prismaMock.user.findFirst.mockResolvedValueOnce(null)
    prismaMock.workerInvitation.findFirst.mockResolvedValueOnce({
      id: "inv-vencida",
      expiresAt: new Date(Date.now() - DIA),
      createdAt: new Date("2026-01-01"),
    })
    prismaMock.workerInvitation.updateMany.mockResolvedValueOnce({ count: 1 })
    prismaMock.business.findUnique.mockResolvedValueOnce({ name: "Otro negocio" })

    const res = await POST(pedidoFalso({ nombre: "Ana Nueva", email: "ana@x.com", rol: "admin" }))
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(data.reemplazoUnaVencida).toBe(true)
    expect(data.invitacion).toMatchObject({ id: "inv-vencida", name: "Ana Nueva", role: "admin" })
    expect(prismaMock.workerInvitation.create).not.toHaveBeenCalled()

    const { where, data: escrito } = prismaMock.workerInvitation.updateMany.mock.calls[0][0]
    // Acotado al negocio de la sesión y a "sin aceptar" también al escribir.
    expect(where).toEqual({ id: "inv-vencida", businessId: "negocio-2", acceptedAt: null })
    expect(escrito).toMatchObject({ name: "Ana Nueva", role: "admin", email: "ana@x.com" })
    expect(escrito.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6.9 * DIA)

    const enlace: string = vi.mocked(enviarInvitacionTrabajador).mock.calls[0][0].enlaceAceptar
    const token = enlace.split("/unirse/")[1]
    expect(escrito.tokenHash).toBe(createHash("sha256").update(token).digest("hex"))
    expect(JSON.stringify(data)).not.toContain(token)
  })

  it("la búsqueda de la anterior mira la más nueva del negocio: si ésa venció, todas vencieron", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    prismaMock.user.findFirst.mockResolvedValueOnce(null)
    prismaMock.workerInvitation.findFirst.mockResolvedValueOnce(null)
    prismaMock.workerInvitation.create.mockResolvedValueOnce({ id: "inv-1" })
    prismaMock.business.findUnique.mockResolvedValueOnce({ name: "Mi negocio" })

    await POST(pedidoFalso({ nombre: "Ana", email: "ana@x.com" }))

    const argumentos = prismaMock.workerInvitation.findFirst.mock.calls[0][0]
    expect(argumentos.where).toMatchObject({ businessId: "negocio-1", acceptedAt: null })
    expect(argumentos.orderBy).toEqual({ expiresAt: "desc" })
  })

  it("reemplazar una vencida cuenta en el límite de reenvíos: pasado, 429 y no escribe ni manda nada", async () => {
    const { POST } = await import("./route")
    const { enviarInvitacionTrabajador } = await import("@/lib/email")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    prismaMock.user.findFirst.mockResolvedValueOnce(null)
    prismaMock.workerInvitation.findFirst.mockResolvedValueOnce({
      id: "inv-vencida",
      expiresAt: new Date(Date.now() - DIA),
      createdAt: new Date(),
    })
    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })

    const res = await POST(pedidoFalso({ nombre: "Ana", email: "Ana@X.com" }))

    expect(res.status).toBe(429)
    expect(mockVerificarLimite).toHaveBeenCalledWith("reenvioDeInvitacion", "negocio-1:ana@x.com")
    expect(prismaMock.workerInvitation.updateMany).not.toHaveBeenCalled()
    expect(enviarInvitacionTrabajador).not.toHaveBeenCalled()
  })

  it("si la aceptaron justo entre la lectura y el reemplazo, no se le cambia el enlace: 409", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    prismaMock.user.findFirst.mockResolvedValueOnce(null)
    prismaMock.workerInvitation.findFirst.mockResolvedValueOnce({
      id: "inv-vencida",
      expiresAt: new Date(Date.now() - DIA),
      createdAt: new Date(),
    })
    prismaMock.workerInvitation.updateMany.mockResolvedValueOnce({ count: 0 })

    const res = await POST(pedidoFalso({ nombre: "Ana", email: "ana@x.com" }))

    expect(res.status).toBe(409)
  })

  it("una invitación nueva, sin ninguna anterior, no pasa por el límite de reenvíos", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    prismaMock.user.findFirst.mockResolvedValueOnce(null)
    prismaMock.workerInvitation.findFirst.mockResolvedValueOnce(null)
    prismaMock.workerInvitation.create.mockResolvedValueOnce({ id: "inv-1" })
    prismaMock.business.findUnique.mockResolvedValueOnce({ name: "Mi negocio" })

    const res = await POST(pedidoFalso({ nombre: "Ana", email: "ana@x.com" }))

    expect(res.status).toBe(201)
    expect(mockVerificarLimite).not.toHaveBeenCalled()
  })
})
