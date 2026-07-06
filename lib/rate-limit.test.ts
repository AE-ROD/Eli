import { describe, it, expect, beforeEach, vi } from "vitest"

vi.mock("@upstash/redis", () => ({
  Redis: vi.fn().mockImplementation(() => ({})),
}))

vi.mock("@upstash/ratelimit", () => {
  class Ratelimit {
    static slidingWindow = vi.fn()
    limit = vi.fn().mockRejectedValue(new Error("Upstash no responde"))
  }
  return { Ratelimit }
})

describe("verificarLimite cuando Upstash está configurado pero falla", () => {
  beforeEach(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://fake.upstash.io")
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "fake-token")
    vi.resetModules()
  })

  it("deja pasar (fail-open) si Upstash tira un error", async () => {
    const { verificarLimite } = await import("./rate-limit")
    const resultado = await verificarLimite("login", "127.0.0.1")
    expect(resultado.permitido).toBe(true)
  })
})

describe("verificarLimite sin Upstash configurado", () => {
  beforeEach(() => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "")
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "")
    vi.resetModules()
  })

  it("deja pasar (fail-open) cuando no hay credenciales de Upstash", async () => {
    const { verificarLimite } = await import("./rate-limit")
    const resultado = await verificarLimite("login", "127.0.0.1")
    expect(resultado.permitido).toBe(true)
  })
})

describe("obtenerIp", () => {
  it("toma la primera IP de x-forwarded-for", async () => {
    const { obtenerIp } = await import("./rate-limit")
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" })
    expect(obtenerIp({ headers })).toBe("1.2.3.4")
  })

  it("usa x-real-ip si no hay x-forwarded-for", async () => {
    const { obtenerIp } = await import("./rate-limit")
    const headers = new Headers({ "x-real-ip": "9.9.9.9" })
    expect(obtenerIp({ headers })).toBe("9.9.9.9")
  })

  it("cae a un valor por defecto si no hay ningún header", async () => {
    const { obtenerIp } = await import("./rate-limit")
    const headers = new Headers()
    expect(obtenerIp({ headers })).toBe("127.0.0.1")
  })
})
