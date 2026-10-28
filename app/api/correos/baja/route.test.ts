import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"
import { tokenDeBaja } from "@/lib/baja-de-correos"
import { cuerpoDePrueba } from "@/pruebas/pedidos"

const mockVerificarLimite = vi.fn()

vi.mock("@/lib/rate-limit", () => ({
  obtenerIp: () => "203.0.113.7",
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
}))

const prismaMock = { user: { updateMany: vi.fn() } }

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

/** Un pedido con cuerpo JSON; un string va tal cual, para probar uno que no es JSON. */
function pedido(cuerpo: unknown): NextRequest {
  return { headers: new Headers(), body: cuerpoDePrueba(cuerpo) } as unknown as NextRequest
}

describe("POST /api/correos/baja", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("NEXTAUTH_SECRET", "secreto-de-prueba")
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 4 })
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 })
  })

  it("con un token válido apaga los correos de prueba de ese usuario, y sólo de ése", async () => {
    const { POST } = await import("./route")

    const respuesta = await POST(pedido({ token: tokenDeBaja("usuario-1") }))

    expect(respuesta.status).toBe(200)
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: "usuario-1" },
      data: { correosDesactivados: true },
    })
  })

  it("responde exactamente lo mismo con token válido, inválido, de un usuario borrado o sin cuerpo", async () => {
    const { POST } = await import("./route")

    const valido = await POST(pedido({ token: tokenDeBaja("usuario-1") }))
    prismaMock.user.updateMany.mockResolvedValueOnce({ count: 0 })
    const borrado = await POST(pedido({ token: tokenDeBaja("usuario-que-ya-no-existe") }))
    const invalido = await POST(pedido({ token: "no-es-un-token" }))
    const ajeno = await POST(pedido({ token: `${Buffer.from("usuario-2").toString("base64url")}.${tokenDeBaja("usuario-1").split(".")[1]}` }))
    const sinToken = await POST(pedido({}))
    const sinJson = await POST(pedido("no es JSON"))

    const respuestas = [valido, borrado, invalido, ajeno, sinToken, sinJson]
    const cuerpos = await Promise.all(respuestas.map((respuesta) => respuesta.text()))
    expect(new Set(respuestas.map((respuesta) => respuesta.status))).toEqual(new Set([200]))
    expect(new Set(cuerpos).size).toBe(1)
  })

  it("con un token inválido no toca la base", async () => {
    const { POST } = await import("./route")

    await POST(pedido({ token: "no-es-un-token" }))
    await POST(pedido({ token: `${Buffer.from("usuario-2").toString("base64url")}.${tokenDeBaja("usuario-1").split(".")[1]}` }))

    expect(prismaMock.user.updateMany).not.toHaveBeenCalled()
  })

  it("tiene límite por IP con el tipo `auth` (falla cerrado), en su propio espacio: 429 sin tocar la base", async () => {
    const { POST } = await import("./route")
    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })

    const respuesta = await POST(pedido({ token: tokenDeBaja("usuario-1") }))

    expect(respuesta.status).toBe(429)
    expect(mockVerificarLimite).toHaveBeenCalledWith("auth", "baja-de-correos:203.0.113.7")
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled()
  })

  it("sólo exporta POST: un GET (antivirus, vista previa del correo) no da de baja a nadie", async () => {
    const ruta = await import("./route")
    expect(Object.keys(ruta).filter((nombre) => /^[A-Z]+$/.test(nombre))).toEqual(["POST"])
  })

  it("si la base falla, 500 genérico sin detalles", async () => {
    const { POST } = await import("./route")
    vi.spyOn(console, "error").mockImplementation(() => {})
    prismaMock.user.updateMany.mockRejectedValueOnce(new Error("conexión caída"))

    const respuesta = await POST(pedido({ token: tokenDeBaja("usuario-1") }))

    expect(respuesta.status).toBe(500)
    expect(Object.keys(await respuesta.json())).toEqual(["error"])
  })
})
