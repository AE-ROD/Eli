import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase, sesiones } from "@/pruebas/datos"
import { datosDeClienteEliminado } from "@/lib/clientes-eliminados"
import { leerCsv } from "@/lib/csv"

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({ getServerSession: (...args: unknown[]) => mockGetServerSession(...args) }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockVerificarLimite = vi.fn(async (..._args: unknown[]) => ({ permitido: true, restantes: 10 }))
vi.mock("@/lib/rate-limit", () => ({ verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args) }))

const base = crearBaseFalsa()
vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

beforeEach(() => {
  vi.clearAllMocks()
  const datos = datosBase()
  base.reiniciar({
    ...datos,
    customer: [
      {
        id: "c-ana",
        businessId: NEGOCIO,
        name: "=HYPERLINK(\"http://malo\")",
        lastName: "Pérez",
        phone: "+56912345678",
        email: "ana@correo.cl",
        tags: ["VIP"],
        notes: "Dice; \"hola\"",
        createdAt: new Date("2026-01-01T12:00:00.000Z"),
      },
      { id: "c-borrado", businessId: NEGOCIO, ...datosDeClienteEliminado(), createdAt: new Date("2026-01-02T12:00:00.000Z") },
      { id: "c-ajeno", businessId: OTRO_NEGOCIO, name: "Ajena", email: "ajena@correo.cl", createdAt: new Date("2026-01-03T12:00:00.000Z") },
    ],
  })
})

describe("GET /api/clientes/exportar", () => {
  it("descarga los clientes del negocio en CSV con BOM, ; y fórmulas neutralizadas, sin eliminados ni ajenos", async () => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const res = await GET()

    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8")
    expect(res.headers.get("Content-Disposition")).toMatch(/^attachment; filename="clientes-\d{4}-\d{2}-\d{2}\.csv"$/)
    expect(res.headers.get("Cache-Control")).toBe("no-store")

    const bytes = new Uint8Array(await res.arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const texto = new TextDecoder().decode(bytes)
    const filas = leerCsv(texto, ";")

    expect(filas).toHaveLength(2)
    expect(filas[0][0]).toBe("Nombre")
    expect(filas[1].slice(0, 7)).toEqual([
      "'=HYPERLINK(\"http://malo\")",
      "Pérez",
      "",
      "'+56912345678",
      "ana@correo.cl",
      "VIP",
      "Dice; \"hola\"",
    ])
    expect(texto).not.toMatch(/Ajena|Cliente eliminado|eli:cliente-eliminado/)
  })

  it("el encargado también descarga", async () => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.encargado)

    expect((await GET()).status).toBe(200)
  })

  it("el dueño de otro negocio sólo ve los suyos", async () => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueñoAjeno)

    const texto = await (await GET()).text()

    expect(texto).toMatch(/Ajena/)
    expect(texto).not.toMatch(/Pérez/)
  })

  it.each([
    ["la profesional", sesiones.carla],
    ["sin sesión", null],
  ])("%s recibe 401 y no lee nada", async (_caso, sesion) => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesion)

    const res = await GET()

    expect(res.status).toBe(401)
    expect(base.prisma.customer.findMany).not.toHaveBeenCalled()
  })

  it("cuenta en el límite de exportaciones del negocio y al pasarse responde 429", async () => {
    const { GET } = await import("./route")
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })

    const res = await GET()

    expect(res.status).toBe(429)
    expect(mockVerificarLimite).toHaveBeenCalledWith("exportacion", `negocio:${NEGOCIO}`)
    expect(base.prisma.customer.findMany).not.toHaveBeenCalled()
  })
})
