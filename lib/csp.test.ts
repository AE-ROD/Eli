import { describe, it, expect } from "vitest"
import { construirCsp, generarNonce } from "./csp"

const directivas = (csp: string): Record<string, string[]> =>
  Object.fromEntries(
    csp.split(";").map((parte) => {
      const [nombre, ...fuentes] = parte.trim().split(/\s+/)
      return [nombre, fuentes]
    })
  )

describe("construirCsp — producción", () => {
  const csp = directivas(construirCsp("abc123", { desarrollo: false }))

  it("sólo deja correr scripts con el nonce de la petición (y lo que ellos carguen)", () => {
    expect(csp["script-src"]).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"])
  })

  it("no habilita eval, ni scripts inline sin nonce, ni websockets", () => {
    expect(csp["script-src"]).not.toContain("'unsafe-eval'")
    expect(csp["script-src"]).not.toContain("'unsafe-inline'")
    expect(csp["connect-src"]).toEqual(["'self'"])
  })

  it("los estilos llevan 'unsafe-inline' y NO un nonce (con nonce el navegador ignoraría 'unsafe-inline')", () => {
    expect(csp["style-src"]).toEqual(["'self'", "'unsafe-inline'"])
  })

  it("mantiene el resto de la política cerrada", () => {
    expect(csp).toMatchObject({
      "default-src": ["'self'"],
      "img-src": ["'self'", "data:", "blob:"],
      "font-src": ["'self'"],
      "frame-ancestors": ["'none'"],
      "base-uri": ["'self'"],
      "form-action": ["'self'"],
      "object-src": ["'none'"],
    })
  })
})

describe("construirCsp — desarrollo", () => {
  const csp = directivas(construirCsp("abc123", { desarrollo: true }))

  it("suma lo que necesitan React y el HMR de Next: 'unsafe-eval' y ws:", () => {
    expect(csp["script-src"]).toContain("'unsafe-eval'")
    expect(csp["connect-src"]).toContain("ws:")
  })

  it("sigue exigiendo el nonce y no abre scripts inline", () => {
    expect(csp["script-src"]).toContain("'nonce-abc123'")
    expect(csp["script-src"]).not.toContain("'unsafe-inline'")
    expect(csp["frame-ancestors"]).toEqual(["'none'"])
  })
})

describe("generarNonce", () => {
  it("es distinto en cada llamada y es base64 de 128 bits", () => {
    const nonces = new Set(Array.from({ length: 50 }, generarNonce))
    expect(nonces.size).toBe(50)
    for (const nonce of nonces) {
      expect(Buffer.from(nonce, "base64")).toHaveLength(16)
      expect(nonce).toMatch(/^[A-Za-z0-9+/]+=*$/)
    }
  })
})
