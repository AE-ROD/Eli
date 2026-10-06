import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

/**
 * Filtro mínimo que entiende las formas de `where` que produce el listado:
 * `AND`, `OR`, igualdad simple, y las condiciones de la búsqueda (`contains`
 * sin distinguir mayúsculas, `has` sobre la lista de etiquetas). Alcanza para
 * que el mock de Prisma filtre de verdad según lo que el endpoint le pasa, en
 * vez de limitarse a inspeccionar el argumento.
 */
function coincide(item: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([clave, valor]) => {
    if (clave === "AND") {
      return (valor as Record<string, unknown>[]).every((sub) => coincide(item, sub))
    }
    if (clave === "OR") {
      return (valor as Record<string, unknown>[]).some((sub) => coincide(item, sub))
    }
    if (valor && typeof valor === "object") {
      const condicion = valor as Record<string, unknown>
      if ("contains" in condicion) {
        return String(item[clave] ?? "").toLowerCase().includes(String(condicion.contains).toLowerCase())
      }
      if ("has" in condicion) {
        return ((item[clave] as unknown[]) ?? []).includes(condicion.has)
      }
    }
    return item[clave] === valor
  })
}

const clientesFake = [
  { id: "cliente-1", businessId: "negocio-1", name: "Ana Pérez", email: "ana@example.com", phone: null, tags: ["vip"] },
  { id: "cliente-2", businessId: "negocio-1", name: "Beto Soto", email: null, phone: "+56 9 1111 1111", tags: [] },
  /** Se llama igual que `cliente-1` y tiene su misma etiqueta: sólo el negocio los distingue. */
  { id: "cliente-ajeno", businessId: "negocio-2", name: "Ana Pérez", email: "ana@otro.com", phone: null, tags: ["vip"] },
]

const prismaMock = {
  customer: {
    findMany: vi.fn((args: { where: Record<string, unknown> }) =>
      Promise.resolve(clientesFake.filter((c) => coincide(c, args.where)))
    ),
    count: vi.fn((args: { where: Record<string, unknown> }) =>
      Promise.resolve(clientesFake.filter((c) => coincide(c, args.where)).length)
    ),
    create: vi.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "cliente-nuevo", ...args.data })
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

const sesionOtroNegocio = {
  user: { id: "owner-2", role: "owner", businessId: "negocio-2", businessName: "Otro negocio" },
}

/** Token viejo o mal formado: hay usuario, pero ningún negocio al que atarlo. */
const sesionSinNegocio = {
  user: { id: "owner-3", role: "owner", businessId: "", businessName: "" },
}

const ids = (clientes: { id: string }[]) => clientes.map((c) => c.id).sort()

const fakeGet = (query = ""): NextRequest =>
  ({ url: `http://localhost/api/clientes${query}` }) as unknown as NextRequest

const fakePost = (body: Record<string, unknown>): NextRequest =>
  ({
    url: "http://localhost/api/clientes",
    json: () => Promise.resolve(body),
  }) as unknown as NextRequest

describe("GET /api/clientes", () => {
  beforeEach(() => vi.clearAllMocks())

  it("el listado sólo trae los clientes del negocio de la sesión", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const res = await GET(fakeGet())
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(ids(data.clientes)).toEqual(["cliente-1", "cliente-2"])
    expect(data.total).toBe(2)
  })

  it("el otro negocio ve sólo lo suyo: el aislamiento va en los dos sentidos", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionOtroNegocio)

    const res = await GET(fakeGet())
    const data = await res.json()

    expect(ids(data.clientes)).toEqual(["cliente-ajeno"])
    expect(data.total).toBe(1)
  })

  it("la búsqueda y la etiqueta no se cuelan a otro negocio, aunque el cliente de allá coincida", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    // `cliente-ajeno` se llama igual y tiene la misma etiqueta: coincidiría con
    // todo el filtro menos con el negocio.
    const res = await GET(fakeGet("?q=ana&tag=vip"))
    const data = await res.json()

    expect(ids(data.clientes)).toEqual(["cliente-1"])
    expect(data.total).toBe(1)
  })

  it("los clientes son del negocio, no del profesional: un worker ve los mismos que el dueño", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionProfesional)

    const res = await GET(fakeGet())
    const data = await res.json()

    expect(ids(data.clientes)).toEqual(["cliente-1", "cliente-2"])
  })

  it("sin sesión recibe 401 y no toca la base", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await GET(fakeGet())

    expect(res.status).toBe(401)
    expect(prismaMock.customer.findMany).not.toHaveBeenCalled()
    expect(prismaMock.customer.count).not.toHaveBeenCalled()
  })

  it("una sesión sin negocio recibe 401 y no toca la base", async () => {
    const { GET } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionSinNegocio)

    const res = await GET(fakeGet())

    expect(res.status).toBe(401)
    expect(prismaMock.customer.findMany).not.toHaveBeenCalled()
  })
})

describe("POST /api/clientes", () => {
  beforeEach(() => vi.clearAllMocks())

  it("crea el cliente en el negocio de la sesión", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    const res = await POST(fakePost({ name: "Carla Díaz", phone: "+56 9 2222 2222" }))

    expect(res.status).toBe(201)
    expect(prismaMock.customer.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: "Carla Díaz", businessId: "negocio-1" }),
    })
  })

  it("el cuerpo no elige el negocio: un `businessId` ajeno se ignora", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesionDueño)

    await POST(fakePost({ name: "Carla Díaz", businessId: "negocio-2" }))

    const { data } = prismaMock.customer.create.mock.calls[0][0]
    expect(data.businessId).toBe("negocio-1")
  })

  it("sin sesión recibe 401 y no crea nada", async () => {
    const { POST } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(null)

    const res = await POST(fakePost({ name: "Carla Díaz" }))

    expect(res.status).toBe(401)
    expect(prismaMock.customer.create).not.toHaveBeenCalled()
  })
})
