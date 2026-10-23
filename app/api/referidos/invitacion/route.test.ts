import { describe, it, expect, vi, beforeEach } from "vitest"
import { pedidoFalso } from "@/pruebas/pedidos"

const mockPrisma = { business: { findUnique: vi.fn() } }

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }))

const enviar = async (cuerpo: unknown) => {
  const { POST } = await import("./route")
  return POST(pedidoFalso(cuerpo))
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
})
