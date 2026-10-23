import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { NextRequest } from "next/server"

const mockMandar = vi.fn()

vi.mock("@/lib/enviar-correo-de-prueba", () => ({
  SELECCION_PARA_CORREO: { id: true },
  mandarCorreoDePrueba: (...args: unknown[]) => mockMandar(...args),
}))

const prismaMock = { business: { findMany: vi.fn() } }

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

function pedido(cabeceras: Record<string, string> = {}): NextRequest {
  return { headers: new Headers(cabeceras) } as unknown as NextRequest
}

const autorizado = () => pedido({ authorization: "Bearer secreto-del-cron" })

/** Un negocio creado hace `dias` días (a las 12:00 de Santiago), con su prueba de 7. */
function negocioDeHace(id: string, dias: number, enviados: string[] = ["bienvenida"]) {
  const createdAt = new Date(Date.UTC(2026, 9, 23 - dias, 15))
  return {
    id,
    timezone: "America/Santiago",
    createdAt,
    pruebaTerminaEl: new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000),
    correosDeCuenta: enviados.map((tipo) => ({ tipo })),
  }
}

describe("GET /api/cron/correos-de-prueba", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-23T13:00:00Z")) // 10:00 en Santiago
    vi.stubEnv("CRON_SECRET", "secreto-del-cron")
    prismaMock.business.findMany.mockResolvedValue([])
    mockMandar.mockResolvedValue("enviado")
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it.each([
    ["sin cabecera", {}],
    ["con otro secreto", { authorization: "Bearer otro" }],
  ])("%s: 401 sin tocar la base", async (_caso, cabeceras) => {
    const { GET } = await import("./route")

    const respuesta = await GET(pedido(cabeceras))

    expect(respuesta.status).toBe(401)
    expect(prismaMock.business.findMany).not.toHaveBeenCalled()
  })

  it("sin CRON_SECRET falla cerrado", async () => {
    const { GET } = await import("./route")
    vi.stubEnv("CRON_SECRET", "")

    const respuesta = await GET(pedido({ authorization: "Bearer " }))

    expect(respuesta.status).toBe(401)
  })

  it("acepta también x-cron-secret, como el de recordatorios", async () => {
    const { GET } = await import("./route")

    const respuesta = await GET(pedido({ "x-cron-secret": "secreto-del-cron" }))

    expect(respuesta.status).toBe(200)
  })

  it("sólo pide negocios que reciben correos, de dueños sin baja y con la prueba vigente o recién vencida", async () => {
    const { GET } = await import("./route")

    await GET(autorizado())

    const { where, take } = prismaMock.business.findMany.mock.calls[0][0]
    expect(where.recibeCorreosDePrueba).toBe(true)
    expect(where.user).toEqual({ correosDesactivados: false })
    expect(where.pruebaTerminaEl.gt.getTime()).toBe(new Date("2026-10-23T13:00:00Z").getTime() - 36 * 60 * 60 * 1000)
    expect(take).toBe(100)
  })

  it("manda lo que toca a cada uno y cuenta enviados y fallidos de verdad", async () => {
    const { GET } = await import("./route")
    prismaMock.business.findMany.mockResolvedValueOnce([
      negocioDeHace("a", 3), // consejo
      negocioDeHace("b", 1), // nada
      negocioDeHace("c", 4), // quedan-3-dias
      negocioDeHace("d", 3), // consejo, falla
    ])
    mockMandar.mockImplementation(async (negocio: { id: string }) => (negocio.id === "d" ? "fallido" : "enviado"))

    const respuesta = await GET(autorizado())

    expect(await respuesta.json()).toEqual({ revisados: 4, enviados: 2, fallidos: 1, incompleto: false })
    expect(mockMandar.mock.calls.map(([negocio, correo]) => [negocio.id, correo.tipo])).toEqual([
      ["a", "consejo"],
      ["c", "quedan-3-dias"],
      ["d", "consejo"],
    ])
  })

  it("'ya-enviado' (otro proceso ganó el candado) no cuenta como enviado ni como fallido", async () => {
    const { GET } = await import("./route")
    prismaMock.business.findMany.mockResolvedValueOnce([negocioDeHace("a", 3)])
    mockMandar.mockResolvedValueOnce("ya-enviado")

    const respuesta = await GET(autorizado())

    expect(await respuesta.json()).toMatchObject({ revisados: 1, enviados: 0, fallidos: 0 })
  })

  it("recorre por lotes con cursor hasta un lote incompleto", async () => {
    const { GET } = await import("./route")
    const lote1 = Array.from({ length: 100 }, (_, i) => negocioDeHace(`n${String(i).padStart(3, "0")}`, 1))
    const lote2 = [negocioDeHace("n100", 3)]
    prismaMock.business.findMany.mockResolvedValueOnce(lote1).mockResolvedValueOnce(lote2)

    const respuesta = await GET(autorizado())

    expect(prismaMock.business.findMany).toHaveBeenCalledTimes(2)
    expect(prismaMock.business.findMany.mock.calls[0][0].cursor).toBeUndefined()
    expect(prismaMock.business.findMany.mock.calls[1][0]).toMatchObject({ cursor: { id: "n099" }, skip: 1, orderBy: { id: "asc" } })
    expect(await respuesta.json()).toEqual({ revisados: 101, enviados: 1, fallidos: 0, incompleto: false })
  })

  it("si la base falla, 500 con lo contado hasta ahí y sin detalles", async () => {
    const { GET } = await import("./route")
    vi.spyOn(console, "error").mockImplementation(() => {})
    prismaMock.business.findMany.mockRejectedValueOnce(new Error("conexión caída"))

    const respuesta = await GET(autorizado())

    expect(respuesta.status).toBe(500)
    expect(await respuesta.json()).toEqual({ error: "Error interno", revisados: 0, enviados: 0, fallidos: 0 })
  })
})
