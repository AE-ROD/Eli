import { describe, it, expect, vi, afterEach } from "vitest"
import { RESPUESTA_DE_PRUEBA, clienteDelModelo, enModoDePrueba } from "./modelo"

describe("modo de prueba de la Secretaria", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("con la variable y fuera de producción, responde el texto fijo sin gastar", async () => {
    vi.stubEnv("SECRETARIA_MODO_PRUEBA", "1")
    vi.stubEnv("NODE_ENV", "development")
    expect(enModoDePrueba()).toBe(true)
    const respuesta = await clienteDelModelo().messages.create({ model: "x", max_tokens: 10, messages: [] })
    expect(respuesta.content).toEqual([expect.objectContaining({ type: "text", text: RESPUESTA_DE_PRUEBA })])
    expect(respuesta.usage.output_tokens).toBe(0)
  })

  it("en producción se ignora aunque esté la variable", () => {
    vi.stubEnv("SECRETARIA_MODO_PRUEBA", "1")
    vi.stubEnv("NODE_ENV", "production")
    expect(enModoDePrueba()).toBe(false)
  })

  it("sin la variable, no está en modo de prueba", () => {
    vi.stubEnv("SECRETARIA_MODO_PRUEBA", "")
    expect(enModoDePrueba()).toBe(false)
  })
})
