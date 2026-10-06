import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

/**
 * Mismo helper que `app/api/citas/[id]/route.test.ts`: entiende la igualdad
 * simple y `AND`, para que el mock de Prisma filtre de verdad según el `where`
 * que arma el endpoint, en vez de limitarse a inspeccionar el argumento.
 */
function coincide(item: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([clave, valor]) => {
    if (clave === "AND") {
      return (valor as Record<string, unknown>[]).every((sub) => coincide(item, sub))
    }
    return item[clave] === valor
  })
}

const clientesFake = [
  { id: "cliente-1", businessId: "negocio-1", name: "Ana Pérez" },
  { id: "cliente-2", businessId: "negocio-1", name: "Beto Soto" },
  { id: "cliente-ajeno", businessId: "negocio-2", name: "Clienta de otro negocio" },
]

const prismaMock = {
  customer: {
    findFirst: vi.fn((args: { where: Record<string, unknown> }) =>
      Promise.resolve(clientesFake.find((c) => coincide(c, args.where)) ?? null)
    ),
    update: vi.fn((args: { where: { id: string }; data: Record<string, unknown> }) => {
      const cliente = clientesFake.find((c) => c.id === args.where.id)
      return Promise.resolve({ ...cliente, ...args.data })
    }),
    delete: vi.fn((args: { where: { id: string } }) =>
      Promise.resolve(clientesFake.find((c) => c.id === args.where.id))
    ),
  },
}

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

const sesionDueño = {
  user: { id: "owner-1", role: "owner", businessId: "negocio-1", businessName: "Mi negocio" },
}

const sesionProfesional = {
  user: {
    id: "worker-1",
    role: "worker",
    businessId: "negocio-1",
    businessName: "Mi negocio",
    memberId: "member-worker-1",
  },
}

/** Dueña de otro negocio: con su sesión, `cliente-1` y `cliente-2` no existen. */
const sesionOtroNegocio = {
  user: { id: "owner-2", role: "owner", businessId: "negocio-2", businessName: "Otro negocio" },
}

/** Token viejo o mal formado: hay usuario, pero ningún negocio al que atarlo. */
const sesionSinNegocio = {
  user: { id: "owner-3", role: "owner", businessId: "", businessName: "" },
}

const fakeRequest = (body?: Record<string, unknown>): NextRequest =>
  ({
    url: "http://localhost/api/clientes/cliente-1",
    json: () => Promise.resolve(body ?? {}),
  }) as unknown as NextRequest

const params = (id: string) => ({ params: Promise.resolve({ id }) })

describe("GET /api/clientes/[id]", () => {
  beforeEach(() => vi.clearAllMocks())

  it("un cliente de otro negocio: 404, no 403", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const res = await GET(fakeRequest(), params("cliente-ajeno"))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "Cliente no encontrado" })
  })

  it("un cliente de otro negocio responde igual que uno que no existe: no se puede averiguar cuál es cuál", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    const resAjeno = await GET(fakeRequest(), params("cliente-ajeno"))

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)
    const resInexistente = await GET(fakeRequest(), params("cliente-que-no-existe"))

    expect(resAjeno.status).toBe(resInexistente.status)
    expect(await resAjeno.json()).toEqual(await resInexistente.json())
  })

  it("la consulta siempre acota por el negocio de la sesión", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    await GET(fakeRequest(), params("cliente-ajeno"))

    expect(prismaMock.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cliente-ajeno", businessId: "negocio-1" } })
    )
  })

  it("un cliente del propio negocio sí se ve", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const res = await GET(fakeRequest(), params("cliente-1"))

    expect(res.status).toBe(200)
    expect((await res.json()).id).toBe("cliente-1")
  })

  it("los clientes son del negocio, no del profesional: un worker del mismo negocio también llega", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await GET(fakeRequest(), params("cliente-2"))

    expect(res.status).toBe(200)
  })

  it("el otro negocio no llega a los clientes de este: el aislamiento va en los dos sentidos", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionOtroNegocio)
    const resAjeno = await GET(fakeRequest(), params("cliente-1"))
    expect(resAjeno.status).toBe(404)

    mockGetServerSession.mockResolvedValueOnce(sesionOtroNegocio)
    const resPropio = await GET(fakeRequest(), params("cliente-ajeno"))
    expect(resPropio.status).toBe(200)
  })

  it("sin sesión recibe 401 y no toca la base", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await GET(fakeRequest(), params("cliente-1"))

    expect(res.status).toBe(401)
    expect(prismaMock.customer.findFirst).not.toHaveBeenCalled()
  })

  it("una sesión sin negocio recibe 401 y no toca la base", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionSinNegocio)

    const res = await GET(fakeRequest(), params("cliente-1"))

    expect(res.status).toBe(401)
    expect(prismaMock.customer.findFirst).not.toHaveBeenCalled()
  })
})

describe("PUT /api/clientes/[id]", () => {
  beforeEach(() => vi.clearAllMocks())

  it("no se puede editar un cliente de otro negocio: 404, no 403", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const res = await PUT(fakeRequest({ name: "Hackeada" }), params("cliente-ajeno"))

    expect(res.status).toBe(404)
    expect(prismaMock.customer.update).not.toHaveBeenCalled()
  })

  it("un cliente del propio negocio sí se edita", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const res = await PUT(fakeRequest({ name: "Ana Actualizada" }), params("cliente-1"))

    expect(res.status).toBe(200)
    expect(prismaMock.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "cliente-1" } })
    )
  })

  it("el cuerpo no puede mudar al cliente a otro negocio: `businessId` nunca llega al update", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    await PUT(fakeRequest({ name: "Ana", businessId: "negocio-2" }), params("cliente-1"))

    const { data } = prismaMock.customer.update.mock.calls[0][0]
    expect(data).not.toHaveProperty("businessId")
  })

  it("sin sesión recibe 401 y no toca la base", async () => {
    const { PUT } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await PUT(fakeRequest({ name: "xx" }), params("cliente-1"))

    expect(res.status).toBe(401)
    expect(prismaMock.customer.findFirst).not.toHaveBeenCalled()
    expect(prismaMock.customer.update).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/clientes/[id]", () => {
  beforeEach(() => vi.clearAllMocks())

  it("no se puede borrar un cliente de otro negocio: 404, no 403", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const res = await DELETE(fakeRequest(), params("cliente-ajeno"))

    expect(res.status).toBe(404)
    expect(prismaMock.customer.delete).not.toHaveBeenCalled()
  })

  it("un cliente del propio negocio sí se borra", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const res = await DELETE(fakeRequest(), params("cliente-1"))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ mensaje: "Cliente eliminado" })
    expect(prismaMock.customer.delete).toHaveBeenCalledWith({ where: { id: "cliente-1" } })
  })

  it("sin sesión recibe 401 y no borra nada", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await DELETE(fakeRequest(), params("cliente-1"))

    expect(res.status).toBe(401)
    expect(prismaMock.customer.delete).not.toHaveBeenCalled()
  })
})
