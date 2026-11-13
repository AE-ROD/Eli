import { describe, it, expect, vi, afterEach } from "vitest"
import { urlBase } from "./url-base"

describe("urlBase", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("usa NEXTAUTH_URL, sin la barra final", () => {
    vi.stubEnv("NEXTAUTH_URL", "https://eli.app/")
    expect(urlBase()).toBe("https://eli.app")
  })

  it("en producción, sin NEXTAUTH_URL, falla fuerte en vez de mandar enlaces a localhost", () => {
    vi.stubEnv("NEXTAUTH_URL", "")
    vi.stubEnv("NODE_ENV", "production")
    expect(() => urlBase()).toThrow(/NEXTAUTH_URL/)
  })

  it("fuera de producción, sin NEXTAUTH_URL, cae a localhost", () => {
    vi.stubEnv("NEXTAUTH_URL", "")
    vi.stubEnv("NODE_ENV", "development")
    expect(urlBase()).toBe("http://localhost:3000")
  })
})
