import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"
import { RUBROS } from "@/lib/rubros"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const prismaMock = {
  business: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
  },
}

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

const sesion = { user: { id: "usuario-1", email: "ana@example.com" } }

const fakeRequest = (body: Record<string, unknown>): NextRequest =>
  ({ json: () => Promise.resolve(body) }) as unknown as NextRequest

describe("POST /api/auth/completar-perfil", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue(sesion)
    prismaMock.business.findFirst.mockResolvedValue(null)
    prismaMock.business.findUnique.mockResolvedValue(null)
    prismaMock.business.create.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "negocio-1", ...args.data })
    )
  })

  it.each(RUBROS.map((rubro) => rubro.id))("crea el negocio con el rubro %s del catálogo", async (tipoNegocio) => {
    const { POST } = await import("./route")

    const res = await POST(fakeRequest({ nombreNegocio: "Salón María", tipoNegocio }))

    expect(res.status).toBe(200)
    expect(prismaMock.business.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: tipoNegocio, userId: "usuario-1" }),
    })
  })

  it.each(["salud", "fitness", "otro", "peluqueria-canina", ""])(
    "rechaza el rubro %j, que no está en el catálogo: 400 y no se crea el negocio",
    async (tipoNegocio) => {
      const { POST } = await import("./route")

      const res = await POST(fakeRequest({ nombreNegocio: "Salón María", tipoNegocio }))

      expect(res.status).toBe(400)
      expect(prismaMock.business.create).not.toHaveBeenCalled()
    }
  )

  it("sin rubro tampoco crea el negocio", async () => {
    const { POST } = await import("./route")

    const res = await POST(fakeRequest({ nombreNegocio: "Salón María" }))

    expect(res.status).toBe(400)
    expect(prismaMock.business.create).not.toHaveBeenCalled()
  })

  it("sin sesión recibe 401 y no toca la base", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await POST(fakeRequest({ nombreNegocio: "Salón María", tipoNegocio: "salon" }))

    expect(res.status).toBe(401)
    expect(prismaMock.business.findFirst).not.toHaveBeenCalled()
    expect(prismaMock.business.create).not.toHaveBeenCalled()
  })
})
