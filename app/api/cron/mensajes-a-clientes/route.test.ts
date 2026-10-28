import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { NextRequest } from "next/server"

const mockMensajes = vi.fn()
vi.mock("@/lib/mensajes-a-clientes", () => ({
  ejecutarMensajesAClientes: (...args: unknown[]) => mockMensajes(...args),
}))

function pedido(cabeceras: Record<string, string> = {}): NextRequest {
  return { headers: new Headers(cabeceras) } as unknown as NextRequest
}

const RESUMEN = { listaDeEspera: {}, teToca: {}, resenas: {}, incompleto: false }

describe("GET /api/cron/mensajes-a-clientes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-28T13:00:00Z"))
    vi.stubEnv("CRON_SECRET", "secreto-del-cron")
    mockMensajes.mockResolvedValue(RESUMEN)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it.each([
    ["sin cabecera", {}],
    ["con otro secreto", { authorization: "Bearer otro" }],
  ])("%s: 401 sin correr nada", async (_caso, cabeceras) => {
    const { GET } = await import("./route")

    const respuesta = await GET(pedido(cabeceras))

    expect(respuesta.status).toBe(401)
    expect(mockMensajes).not.toHaveBeenCalled()
  })

  it("sin CRON_SECRET falla cerrado", async () => {
    const { GET } = await import("./route")
    vi.stubEnv("CRON_SECRET", "")

    const respuesta = await GET(pedido({ authorization: "Bearer " }))

    expect(respuesta.status).toBe(401)
    expect(mockMensajes).not.toHaveBeenCalled()
  })

  it("autorizado, corre la corrida con 50 s de plazo y devuelve su resumen", async () => {
    const { GET } = await import("./route")

    const respuesta = await GET(pedido({ authorization: "Bearer secreto-del-cron" }))

    expect(respuesta.status).toBe(200)
    expect(await respuesta.json()).toEqual(RESUMEN)
    const [{ ahora, hasta }] = mockMensajes.mock.calls[0]
    expect(ahora).toEqual(new Date("2026-10-28T13:00:00Z"))
    expect(hasta).toBe(ahora.getTime() + 50_000)
  })
})
