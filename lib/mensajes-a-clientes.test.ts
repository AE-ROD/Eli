import { describe, it, expect, vi, beforeEach } from "vitest"
import { TOPE_ENVIOS_POR_CORRIDA, resumenVacio, type ContextoDeCorrida } from "./envios-a-clientes"
import { ejecutarMensajesAClientes } from "./mensajes-a-clientes"

const mockExpirar = vi.fn()
const mockTeToca = vi.fn()
const mockResenas = vi.fn()

vi.mock("@/lib/lista-de-espera", () => ({ expirarListaDeEspera: (...args: unknown[]) => mockExpirar(...args) }))
vi.mock("@/lib/te-toca", () => ({ ejecutarTeToca: (...args: unknown[]) => mockTeToca(...args) }))
vi.mock("@/lib/resenas", () => ({ ejecutarResenas: (...args: unknown[]) => mockResenas(...args) }))


const AHORA = new Date("2026-10-28T13:00:00.000Z")

describe("ejecutarMensajesAClientes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExpirar.mockResolvedValue(resumenVacio())
    mockTeToca.mockResolvedValue(resumenVacio())
    mockResenas.mockResolvedValue(resumenVacio())
  })

  it("corre los tres trabajos en orden, con el mismo contexto: un solo cupo para toda la corrida", async () => {
    mockTeToca.mockImplementationOnce(async (contexto: ContextoDeCorrida) => {
      contexto.cupo.restantes -= 7
      return { ...resumenVacio(), enviados: 7 }
    })
    const hasta = Date.now() + 50_000

    const resumen = await ejecutarMensajesAClientes({ ahora: AHORA, hasta })

    expect(mockExpirar.mock.invocationCallOrder[0]).toBeLessThan(mockTeToca.mock.invocationCallOrder[0])
    expect(mockTeToca.mock.invocationCallOrder[0]).toBeLessThan(mockResenas.mock.invocationCallOrder[0])
    const [contexto] = mockResenas.mock.calls[0]
    expect(contexto).toMatchObject({ ahora: AHORA, hasta })
    expect(contexto.cupo.restantes).toBe(TOPE_ENVIOS_POR_CORRIDA - 7)
    expect(mockExpirar.mock.calls[0][0]).toBe(contexto)
    expect(resumen).toMatchObject({ teToca: { enviados: 7 }, incompleto: false })
  })

  it("un trabajo que lanza no corta a los demás; su resumen sale con error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mockTeToca.mockRejectedValueOnce(new Error("se cayó"))

    const resumen = await ejecutarMensajesAClientes({ ahora: AHORA, hasta: Date.now() + 50_000 })

    expect(mockResenas).toHaveBeenCalledTimes(1)
    expect(resumen.teToca).toMatchObject({ error: true, incompleto: true })
    expect(resumen.incompleto).toBe(true)
  })

  it("pasado el plazo no empieza ningún trabajo y lo dice", async () => {
    const resumen = await ejecutarMensajesAClientes({ ahora: AHORA, hasta: Date.now() - 1 })

    expect(mockExpirar).not.toHaveBeenCalled()
    expect(mockTeToca).not.toHaveBeenCalled()
    expect(mockResenas).not.toHaveBeenCalled()
    expect(resumen.incompleto).toBe(true)
  })
})
