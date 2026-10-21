import { describe, it, expect } from "vitest"
import nextConfig from "./next.config.mjs"

describe("next.config — cabeceras de seguridad", () => {
  it("no anuncia X-Powered-By: Next.js", () => {
    expect(nextConfig.poweredByHeader).toBe(false)
  })

  it("aplica las cabeceras de seguridad a todas las rutas, páginas y API", async () => {
    const reglas = (await nextConfig.headers?.()) ?? []
    const global = reglas.find((regla) => regla.source === "/:path*")
    expect(global).toBeDefined()

    const cabeceras = Object.fromEntries(global!.headers.map(({ key, value }) => [key.toLowerCase(), value]))
    expect(cabeceras).toMatchObject({
      "x-frame-options": "DENY",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "permissions-policy": "camera=(), microphone=(), geolocation=()",
    })
  })

  it("no manda una CSP estática: la arma el proxy con nonce, y dos CSP se aplicarían a la vez", async () => {
    const reglas = (await nextConfig.headers?.()) ?? []
    const claves = reglas.flatMap((regla) => regla.headers.map(({ key }) => key.toLowerCase()))
    expect(claves).not.toContain("content-security-policy")
  })
})
