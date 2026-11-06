import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"
import { cuerpoDePrueba } from "@/pruebas/pedidos"

const mockPrisma = { business: { findUnique: vi.fn() } }

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }))

/** Un pedido como el que manda crear-cuenta: JSON, desde el mismo host. */
const pedido = (cuerpo: unknown, cabeceras: Record<string, string> = {}) =>
  ({
    headers: new Headers({ "content-type": "application/json", host: "eli.test", ...cabeceras }),
    body: cuerpoDePrueba(cuerpo),
  }) as unknown as NextRequest

const enviar = async (cuerpo: unknown, cabeceras?: Record<string, string>) => {
  const { POST } = await import("./route")
  return POST(pedido(cuerpo, cabeceras))
}

/** La cabecera `Set-Cookie` de la cookie de invitación, ya separada en partes. */
function cookieDe(respuesta: Response): string {
  return respuesta.headers.get("set-cookie") ?? ""
}

describe("POST /api/referidos/invitacion", () => {
  beforeEach(() => vi.clearAllMocks())

  it("con un código bien formado: 204 y una cookie httpOnly, Lax, corta y sólo para completar-perfil", async () => {
    const respuesta = await enviar({ codigo: " AB12CD34EF " })
    const cookie = cookieDe(respuesta)

    expect(respuesta.status).toBe(204)
    expect(cookie).toContain("eli-invita=ab12cd34ef")
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=lax/i)
    expect(cookie).toContain("Path=/api/auth/completar-perfil")
    expect(cookie).toContain("Max-Age=1800")
  })

  it.each([
    ["mal formado", { codigo: "no-sirve" }],
    ["sin código", {}],
    ["un número", { codigo: 1234567890 }],
    ["cuerpo vacío", null],
  ])("%s: 204 igual y vence la cookie que hubiera", async (_caso, cuerpo) => {
    const respuesta = await enviar(cuerpo)

    expect(respuesta.status).toBe(204)
    expect(cookieDe(respuesta)).toMatch(/eli-invita=;/)
    expect(cookieDe(respuesta)).toContain("Max-Age=0")
  })

  it("no consulta la base: no dice si el código existe", async () => {
    await enviar({ codigo: "ab12cd34ef" })

    expect(mockPrisma.business.findUnique).not.toHaveBeenCalled()
  })

  it("sin Content-Type JSON: 415 y no toca las cookies", async () => {
    for (const tipo of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", ""]) {
      const respuesta = await enviar({ codigo: "ab12cd34ef" }, { "content-type": tipo })

      expect(respuesta.status).toBe(415)
      expect(cookieDe(respuesta)).toBe("")
    }
  })

  it("acepta Content-Type JSON con charset", async () => {
    const respuesta = await enviar({ codigo: "ab12cd34ef" }, { "content-type": "application/json; charset=utf-8" })

    expect(respuesta.status).toBe(204)
    expect(cookieDe(respuesta)).toContain("eli-invita=ab12cd34ef")
  })

  it("con Origin del propio host o de NEXTAUTH_URL: 204", async () => {
    vi.stubEnv("NEXTAUTH_URL", "https://eli.example.com")
    try {
      expect((await enviar({ codigo: "ab12cd34ef" }, { origin: "https://eli.test" })).status).toBe(204)
      expect((await enviar({ codigo: "ab12cd34ef" }, { origin: "https://eli.example.com" })).status).toBe(204)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it.each(["https://malicioso.example", "null", "no es una url"])(
    "con Origin ajeno (%s): 403 y no toca las cookies",
    async (origin) => {
      vi.stubEnv("NEXTAUTH_URL", "https://eli.example.com")
      try {
        const respuesta = await enviar({ codigo: "ab12cd34ef" }, { origin })

        expect(respuesta.status).toBe(403)
        expect(cookieDe(respuesta)).toBe("")
      } finally {
        vi.unstubAllEnvs()
      }
    }
  )
})
