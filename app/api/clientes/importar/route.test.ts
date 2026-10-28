import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"
import { MARCA_DE_CLIENTE_ELIMINADO } from "@/lib/clientes-eliminados"

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockVerificarLimite = vi.fn(async (..._args: unknown[]) => ({ permitido: true, restantes: 4 }))
vi.mock("@/lib/rate-limit", () => ({ verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args) }))

vi.mock("@/lib/registro-de-errores", () => ({ registrarError: vi.fn() }))

type Cliente = { businessId: string; phone: string | null; email: string | null; tags: string[] }

/** Clientes que ya están en la base: dos de este negocio, uno eliminado y uno ajeno. */
let enLaBase: Cliente[] = []

/**
 * Sólo entiende el `where` que arma el endpoint (`whereDeClientes` con
 * `clienteNoEliminado`): lo recorre en vez de mirar su forma, así un filtro
 * que deje de acotar al negocio trae clientes ajenos y el test lo nota.
 */
function cumple(cliente: Cliente, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([clave, valor]) => {
    if (clave === "AND") return (valor as Record<string, unknown>[]).every((sub) => cumple(cliente, sub))
    if (clave === "NOT") return !cumple(cliente, valor as Record<string, unknown>)
    if (clave === "tags") return cliente.tags.includes((valor as { has: string }).has)
    if (clave === "businessId") return cliente.businessId === valor
    if (clave === "id") return false
    throw new Error(`where no esperado: ${clave}`)
  })
}

const prismaMock = {
  customer: {
    findMany: vi.fn(async (args: { where: Record<string, unknown> }) =>
      enLaBase.filter((c) => cumple(c, args.where)).map(({ phone, email }) => ({ phone, email }))
    ),
    createMany: vi.fn(async (args: { data: unknown[] }) => ({ count: args.data.length })),
  },
}
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

const sesion = (role: string, businessId = "negocio-1") => ({ user: { id: `u-${role}`, role, businessId, memberId: role === "owner" ? null : "m-1" } })

function pedido(cuerpo: unknown): NextRequest {
  return new Request("http://localhost/api/clientes/importar", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo),
  }) as unknown as NextRequest
}

const MAPEO = { nombre: 0, apellido: 1, telefono: 2, email: 3 }

const creados = () => prismaMock.customer.createMany.mock.calls.flatMap(([args]) => args.data) as Record<string, unknown>[]

beforeEach(() => {
  vi.clearAllMocks()
  enLaBase = [
    { businessId: "negocio-1", phone: "9 1111 1111", email: null, tags: [] },
    { businessId: "negocio-1", phone: null, email: "Existe@Correo.cl", tags: [] },
    // Eliminado: sin contacto, como lo deja la anonimización.
    { businessId: "negocio-1", phone: null, email: null, tags: [MARCA_DE_CLIENTE_ELIMINADO] },
    // De otro negocio: no cuenta como duplicado.
    { businessId: "negocio-2", phone: "+56922222222", email: "ajeno@correo.cl", tags: [] },
  ]
})

describe("POST /api/clientes/importar", () => {
  it("crea los clientes en el negocio de la sesión y devuelve el resumen con filas y motivos", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesion("owner"))

    const csv = [
      "Nombre;Apellido;Teléfono;Email",
      "Ana;Pérez;+56 9 2222 2222;ajeno@correo.cl",
      "Beto;;9 1111 1111;",
      "Carla;;;existe@correo.cl",
      "Dani;;12345;",
      "Eva;;922222222;",
    ].join("\n")
    const res = await POST(pedido({ csv, mapeo: MAPEO }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      creados: 1,
      duplicados: [
        { fila: 3, motivo: "Ya existe un cliente con ese teléfono" },
        { fila: 4, motivo: "Ya existe un cliente con ese correo" },
        { fila: 6, motivo: "Repite el teléfono o el correo de la fila 2" },
      ],
      errores: [{ fila: 5, motivo: expect.stringMatching(/No pudimos leer el teléfono/) }],
    })
    expect(creados()).toEqual([
      {
        businessId: "negocio-1",
        name: "Ana Pérez",
        phone: "+56922222222",
        email: "ajeno@correo.cl",
        notes: null,
        tags: [],
        whatsappConsentAt: null,
        whatsappConsentSource: null,
      },
    ])
  })

  it("sólo compara contra los clientes del propio negocio", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesion("owner"))

    await POST(pedido({ csv: "Nombre;Apellido;Teléfono;Email\nAna;;;ajeno@correo.cl", mapeo: MAPEO }))

    expect(creados()).toHaveLength(1)
    expect(creados()[0].businessId).toBe("negocio-1")
  })

  it("el cuerpo no elige el negocio", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesion("admin"))

    await POST(pedido({ csv: "Nombre\nAna", mapeo: { nombre: 0 }, businessId: "negocio-2" }))

    expect(creados()[0].businessId).toBe("negocio-1")
  })

  it("con la columna de consentimiento, quien dice sí queda con consentimiento de la importación", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesion("owner"))

    await POST(pedido({ csv: "Nombre,Acepta WhatsApp\nAna,Sí\nBeto,No", mapeo: { nombre: 0, whatsapp: 1 } }))

    const [ana, beto] = creados()
    expect(ana).toMatchObject({ whatsappConsentSource: "importacion" })
    expect(ana.whatsappConsentAt).toBeInstanceOf(Date)
    expect(beto).toMatchObject({ whatsappConsentAt: null, whatsappConsentSource: null })
  })

  it("escribe por lotes de 500", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesion("owner"))
    const filas = Array.from({ length: 1200 }, (_, i) => `Cliente ${i}`)

    const res = await POST(pedido({ csv: ["Nombre", ...filas].join("\n"), mapeo: { nombre: 0 } }))

    expect((await res.json()).creados).toBe(1200)
    expect(prismaMock.customer.createMany.mock.calls.map(([args]) => args.data.length)).toEqual([500, 500, 200])
  })

  it("si un lote falla, sus filas salen como error y los demás se guardan igual", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesion("owner"))
    prismaMock.customer.createMany.mockRejectedValueOnce(new Error("se cayó la base"))
    const filas = Array.from({ length: 600 }, (_, i) => `Cliente ${i}`)

    const cuerpo = await (await POST(pedido({ csv: ["Nombre", ...filas].join("\n"), mapeo: { nombre: 0 } }))).json()

    expect(cuerpo.creados).toBe(100)
    expect(cuerpo.errores).toHaveLength(500)
    expect(cuerpo.errores[0]).toEqual({ fila: 2, motivo: "No se pudo guardar. Vuelve a importar el archivo." })
  })

  it.each([
    ["el profesional", sesion("worker")],
    ["sin sesión", null],
    ["una sesión sin negocio", { user: { id: "x", role: "owner", businessId: "" } }],
  ])("%s recibe 401, no consume cupo y no escribe nada", async (_caso, laSesion) => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(laSesion)

    const res = await POST(pedido({ csv: "Nombre\nAna", mapeo: { nombre: 0 } }))

    expect(res.status).toBe(401)
    expect(mockVerificarLimite).not.toHaveBeenCalled()
    expect(prismaMock.customer.createMany).not.toHaveBeenCalled()
  })

  it("cuenta en su propio límite, por negocio, y al pasarse responde 429 sin leer ni escribir", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesion("owner"))
    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })

    const res = await POST(pedido({ csv: "Nombre\nAna", mapeo: { nombre: 0 } }))

    expect(res.status).toBe(429)
    expect(mockVerificarLimite).toHaveBeenCalledWith("importacionDeClientes", "negocio:negocio-1")
    expect(prismaMock.customer.findMany).not.toHaveBeenCalled()
    expect(prismaMock.customer.createMany).not.toHaveBeenCalled()
  })

  it("un archivo de más de 2 MB es 413", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesion("owner"))

    const res = await POST(pedido({ csv: `Nombre\n${"a".repeat(2 * 1024 * 1024)}`, mapeo: { nombre: 0 } }))

    expect(res.status).toBe(413)
    expect(prismaMock.customer.createMany).not.toHaveBeenCalled()
  })

  it("un cuerpo enorme se corta sin leerlo entero: 413", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesion("owner"))

    const res = await POST(pedido("x".repeat(5 * 1024 * 1024)))

    expect(res.status).toBe(413)
  })

  it("más de 5.000 filas es 400 y no escribe nada", async () => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesion("owner"))
    const filas = Array.from({ length: 5001 }, (_, i) => `C${i}`)

    const res = await POST(pedido({ csv: ["Nombre", ...filas].join("\n"), mapeo: { nombre: 0 } }))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/más de 5\.000 filas/)
    expect(prismaMock.customer.createMany).not.toHaveBeenCalled()
  })

  it.each([
    ["sólo la cabecera", { csv: "Nombre", mapeo: { nombre: 0 } }, /no tiene clientes/],
    ["una columna que el archivo no tiene", { csv: "Nombre\nAna", mapeo: { nombre: 3 } }, /no está en el archivo/],
    ["sin mapeo del nombre", { csv: "Nombre\nAna", mapeo: {} }, /.+/],
    ["sin archivo", { mapeo: { nombre: 0 } }, /Falta el archivo/],
    ["un JSON roto", "{csv:", /.+/],
  ])("%s es 400", async (_caso, cuerpo, mensaje) => {
    const { POST } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesion("owner"))

    const res = await POST(pedido(cuerpo))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(mensaje)
    expect(prismaMock.customer.createMany).not.toHaveBeenCalled()
  })
})
