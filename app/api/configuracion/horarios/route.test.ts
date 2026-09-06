import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const prismaMock = {
  businessMember: { findUnique: vi.fn() },
  workSchedule: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
  $transaction: vi.fn(),
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

const fakeRequest = (url: string, body?: unknown): NextRequest =>
  ({
    headers: new Headers(),
    nextUrl: new URL(url, "http://localhost"),
    json: async () => body,
  }) as unknown as NextRequest

describe("GET /api/configuracion/horarios", () => {
  beforeEach(() => vi.clearAllMocks())

  it("sin sesión recibe 401", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await GET(fakeRequest("/api/configuracion/horarios"))

    expect(res.status).toBe(401)
  })

  it("un dueño sin memberId ve el horario general del negocio (clave null)", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    prismaMock.workSchedule.findMany.mockResolvedValueOnce([])

    const res = await GET(fakeRequest("/api/configuracion/horarios"))

    expect(res.status).toBe(200)
    const argumentos = prismaMock.workSchedule.findMany.mock.calls[0][0]
    expect(argumentos.where).toEqual({ businessId: "negocio-1", memberId: null })
  })

  it("un profesional sin memberId en la URL ve su propio horario", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)
    prismaMock.workSchedule.findMany.mockResolvedValueOnce([])

    const res = await GET(fakeRequest("/api/configuracion/horarios"))

    expect(res.status).toBe(200)
    const argumentos = prismaMock.workSchedule.findMany.mock.calls[0][0]
    expect(argumentos.where).toEqual({ businessId: "negocio-1", memberId: "member-worker-1" })
  })

  it("un encargado (admin) puede ver el horario de otro miembro de su negocio", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)
    prismaMock.businessMember.findUnique.mockResolvedValueOnce({
      id: "member-worker-1",
      businessId: "negocio-1",
    })
    prismaMock.workSchedule.findMany.mockResolvedValueOnce([])

    const res = await GET(fakeRequest("/api/configuracion/horarios?memberId=member-worker-1"))

    expect(res.status).toBe(200)
    const argumentos = prismaMock.workSchedule.findMany.mock.calls[0][0]
    expect(argumentos.where).toEqual({ businessId: "negocio-1", memberId: "member-worker-1" })
  })

  it("un profesional (worker) pidiendo el horario de otro miembro recibe 401", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)
    prismaMock.businessMember.findUnique.mockResolvedValueOnce({
      id: "member-admin-1",
      businessId: "negocio-1",
    })

    const res = await GET(fakeRequest("/api/configuracion/horarios?memberId=member-admin-1"))

    expect(res.status).toBe(401)
    expect(prismaMock.workSchedule.findMany).not.toHaveBeenCalled()
  })

  it("un miembro de otro negocio da 404, nunca 403", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)
    // El miembro existe, pero es de "negocio-2": ajeno al actor de "negocio-1".
    prismaMock.businessMember.findUnique.mockResolvedValueOnce({
      id: "member-otro-negocio",
      businessId: "negocio-2",
    })

    const res = await GET(fakeRequest("/api/configuracion/horarios?memberId=member-otro-negocio"))

    expect(res.status).toBe(404)
    expect(prismaMock.workSchedule.findMany).not.toHaveBeenCalled()
  })

  it("un memberId inexistente da 404, igual que uno de otro negocio", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)
    prismaMock.businessMember.findUnique.mockResolvedValueOnce(null)

    const res = await GET(fakeRequest("/api/configuracion/horarios?memberId=no-existe"))

    expect(res.status).toBe(404)
  })
})

describe("POST /api/configuracion/horarios", () => {
  beforeEach(() => vi.clearAllMocks())

  const horarios = [{ dayOfWeek: 1, startTime: "09:00", endTime: "18:00", active: true }]

  it("sin sesión recibe 401", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await POST(fakeRequest("/api/configuracion/horarios", horarios))

    expect(res.status).toBe(401)
  })

  it("un encargado (admin) edita el horario de cualquier miembro de su negocio", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)
    prismaMock.businessMember.findUnique.mockResolvedValueOnce({
      id: "member-worker-1",
      businessId: "negocio-1",
    })
    prismaMock.$transaction.mockResolvedValueOnce(undefined)
    prismaMock.workSchedule.findMany.mockResolvedValueOnce(horarios)

    const res = await POST(fakeRequest("/api/configuracion/horarios?memberId=member-worker-1", horarios))

    expect(res.status).toBe(200)
    const argumentosCreate = prismaMock.workSchedule.createMany.mock.calls[0][0]
    expect(argumentosCreate.data[0]).toMatchObject({ businessId: "negocio-1", memberId: "member-worker-1" })
  })

  it("un encargado sin memberId en la URL edita su propio horario, no el general", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)
    prismaMock.$transaction.mockResolvedValueOnce(undefined)
    prismaMock.workSchedule.findMany.mockResolvedValueOnce(horarios)

    const res = await POST(fakeRequest("/api/configuracion/horarios", horarios))

    expect(res.status).toBe(200)
    // El nombre viejo de este test decía "el horario general" y sólo miraba el
    // status: escribía en su propio memberId y pasaba igual.
    const argumentosCreate = prismaMock.workSchedule.createMany.mock.calls[0][0]
    expect(argumentosCreate.data[0]).toMatchObject({
      businessId: "negocio-1",
      memberId: "member-admin-1",
    })
  })

  it("un profesional sin memberId no reescribe el horario general del negocio", async () => {
    const { POST } = await import("./route")

    // `memberId: null` en un worker no debería existir tras el login, pero si
    // llegara, el horario general (memberId: null) es el de la reserva pública.
    mockGetServerSession.mockResolvedValueOnce({
      user: { ...sesionProfesional.user, memberId: null },
    })

    const res = await POST(fakeRequest("/api/configuracion/horarios", horarios))

    expect(res.status).toBe(401)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(prismaMock.workSchedule.createMany).not.toHaveBeenCalled()
  })

  it("un profesional (worker) sólo edita el propio: pedir el de otro da 401", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)
    prismaMock.businessMember.findUnique.mockResolvedValueOnce({
      id: "member-admin-1",
      businessId: "negocio-1",
    })

    const res = await POST(fakeRequest("/api/configuracion/horarios?memberId=member-admin-1", horarios))

    expect(res.status).toBe(401)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })

  it("un profesional (worker) puede editar el propio horario", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)
    prismaMock.$transaction.mockResolvedValueOnce(undefined)
    prismaMock.workSchedule.findMany.mockResolvedValueOnce(horarios)

    const res = await POST(fakeRequest("/api/configuracion/horarios", horarios))

    expect(res.status).toBe(200)
    const argumentosCreate = prismaMock.workSchedule.createMany.mock.calls[0][0]
    expect(argumentosCreate.data[0]).toMatchObject({ businessId: "negocio-1", memberId: "member-worker-1" })
  })

  it("un miembro de otro negocio da 404, nunca 403, y no llega a escribir", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionEncargado)
    prismaMock.businessMember.findUnique.mockResolvedValueOnce({
      id: "member-otro-negocio",
      businessId: "negocio-2",
    })

    const res = await POST(fakeRequest("/api/configuracion/horarios?memberId=member-otro-negocio", horarios))

    expect(res.status).toBe(404)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
  })
})
