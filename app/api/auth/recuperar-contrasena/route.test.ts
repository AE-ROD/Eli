import { describe, it, expect, vi, beforeEach } from "vitest"
import { pedidoFalso } from "@/pruebas/pedidos"
import { createHash } from "node:crypto"

const mockVerificarLimite = vi.fn()
const mockEnviarRecuperacion = vi.fn()

vi.mock("@/lib/rate-limit", () => ({
  obtenerIp: () => "203.0.113.7",
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
}))

vi.mock("@/lib/email", () => ({
  enviarRecuperacionContrasena: (...args: unknown[]) => mockEnviarRecuperacion(...args),
}))

const prismaMock = {
  user: { findUnique: vi.fn() },
  passwordResetToken: { create: vi.fn() },
}

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

// `after` de verdad exige estar dentro de un pedido de Next: acá se guardan
// las tareas y el test las corre cuando quiere ver lo que pasa después.
const pendientes: (() => unknown)[] = []
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (tarea: () => unknown) => pendientes.push(tarea),
}))

/** Corre lo que el endpoint dejó para después de responder. */
async function despuesDeResponder() {
  while (pendientes.length) await pendientes.shift()!()
}

const usuario = { id: "usuario-1", email: "ana@example.com", name: "Ana", password: "hash" }

describe("POST /api/auth/recuperar-contrasena", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pendientes.length = 0
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 4 })
    mockEnviarRecuperacion.mockResolvedValue(null)
    prismaMock.user.findUnique.mockResolvedValue(usuario)
    prismaMock.passwordResetToken.create.mockResolvedValue({ token: "token-abc" })
  })

  it("sigue limitado por IP con el límite `auth`: pasado el tope, 429 sin tocar la base ni mandar correos", async () => {
    const { POST } = await import("./route")

    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })

    const res = await POST(pedidoFalso({ email: "ana@example.com" }))

    expect(res.status).toBe(429)
    expect(mockVerificarLimite).toHaveBeenCalledWith("auth", "203.0.113.7")
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
    expect(mockEnviarRecuperacion).not.toHaveBeenCalled()
  })

  it("manda un enlace que apunta a la página /restablecer-contrasena/<token>", async () => {
    const { POST } = await import("./route")

    const res = await POST(pedidoFalso({ email: "ana@example.com" }))
    await despuesDeResponder()

    expect(res.status).toBe(200)
    expect(mockEnviarRecuperacion).toHaveBeenCalledWith(
      expect.objectContaining({
        emailUsuario: "ana@example.com",
        enlaceRestablecer: expect.stringMatching(/\/restablecer-contrasena\/[A-Za-z0-9_-]{43}$/),
      })
    )
  })

  it("lo que se guarda es el hash del token del enlace, nunca el token en claro", async () => {
    const { POST } = await import("./route")

    const res = await POST(pedidoFalso({ email: "ana@example.com" }))
    await despuesDeResponder()

    expect(res.status).toBe(200)
    const enlace: string = mockEnviarRecuperacion.mock.calls[0][0].enlaceRestablecer
    const tokenDelEnlace = enlace.split("/restablecer-contrasena/")[1]
    const guardado = prismaMock.passwordResetToken.create.mock.calls[0][0].data

    // 32 bytes al azar en base64url, no un cuid predecible.
    expect(tokenDelEnlace).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(guardado.tokenHash).toBe(createHash("sha256").update(tokenDelEnlace).digest("hex"))
    expect(JSON.stringify(guardado)).not.toContain(tokenDelEnlace)
    expect(JSON.stringify(await res.json())).not.toContain(tokenDelEnlace)
  })

  it("con un correo sin cuenta responde lo mismo que con uno que existe: no revela quién tiene cuenta", async () => {
    const { POST } = await import("./route")

    const conCuenta = await POST(pedidoFalso({ email: "ana@example.com" }))
    const cuerpoConCuenta = await conCuenta.json()

    await despuesDeResponder()

    prismaMock.user.findUnique.mockResolvedValueOnce(null)
    const sinCuenta = await POST(pedidoFalso({ email: "nadie@example.com" }))
    await despuesDeResponder()

    expect(sinCuenta.status).toBe(conCuenta.status)
    expect(await sinCuenta.json()).toEqual(cuerpoConCuenta)
    // Y a quien no tiene cuenta no se le crea un token ni se le escribe.
    expect(prismaMock.passwordResetToken.create).toHaveBeenCalledTimes(1)
    expect(mockEnviarRecuperacion).toHaveBeenCalledTimes(1)
  })

  it("una cuenta de Google, sin contraseña que restablecer, responde igual y no recibe correo", async () => {
    const { POST } = await import("./route")

    prismaMock.user.findUnique.mockResolvedValueOnce({ ...usuario, password: "" })

    const res = await POST(pedidoFalso({ email: "ana@example.com" }))
    await despuesDeResponder()

    expect(res.status).toBe(200)
    expect(mockEnviarRecuperacion).not.toHaveBeenCalled()
  })

  it("rechaza un correo inválido con 400", async () => {
    const { POST } = await import("./route")

    const res = await POST(pedidoFalso({ email: "no-es-un-correo" }))

    expect(res.status).toBe(400)
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  })

  it.each(["{roto", ""])("un cuerpo que no es JSON (%j) da 400, no 500", async (cuerpo) => {
    const { POST } = await import("./route")

    const res = await POST(pedidoFalso(cuerpo))

    expect(res.status).toBe(400)
    expect(pendientes).toHaveLength(0)
  })

  it("responde antes de buscar la cuenta: ni el cuerpo ni el tiempo dicen si existe", async () => {
    const { POST } = await import("./route")

    const res = await POST(pedidoFalso({ email: "ana@example.com" }))

    // La respuesta ya salió y todavía no se buscó a nadie ni se mandó nada.
    expect(res.status).toBe(200)
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
    expect(mockEnviarRecuperacion).not.toHaveBeenCalled()
    await despuesDeResponder()
    expect(mockEnviarRecuperacion).toHaveBeenCalledTimes(1)
  })

  it("tope por correo de destino, contado por el hash del correo: pasado, responde igual y no manda nada", async () => {
    const { POST } = await import("./route")
    mockVerificarLimite.mockImplementation(async (tipo: string) => ({ permitido: tipo !== "recuperacionPorCorreo", restantes: 0 }))

    const res = await POST(pedidoFalso({ email: "ana@example.com" }))
    await despuesDeResponder()

    expect(res.status).toBe(200)
    expect(mockVerificarLimite).toHaveBeenCalledWith(
      "recuperacionPorCorreo",
      createHash("sha256").update("ana@example.com").digest("hex")
    )
    expect(prismaMock.passwordResetToken.create).not.toHaveBeenCalled()
    expect(mockEnviarRecuperacion).not.toHaveBeenCalled()
  })

  it("un error al mandar va al log sin el error completo (ni el correo)", async () => {
    const { POST } = await import("./route")
    const consola = vi.spyOn(console, "error").mockImplementation(() => {})
    mockEnviarRecuperacion.mockRejectedValueOnce(Object.assign(new Error("fallo para ana@example.com"), { name: "ErrorDeResend" }))

    await POST(pedidoFalso({ email: "ana@example.com" }))
    await despuesDeResponder()

    expect(consola).toHaveBeenCalledWith("Error mandando el enlace de recuperar contraseña:", { name: "ErrorDeResend", code: undefined })
    expect(JSON.stringify(consola.mock.calls)).not.toContain("ana@example.com")
    consola.mockRestore()
  })

  it("en producción sin NEXTAUTH_URL no guarda ni manda un enlace a localhost", async () => {
    const { POST } = await import("./route")
    const consola = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.stubEnv("NEXTAUTH_URL", "")
    vi.stubEnv("NODE_ENV", "production")

    await POST(pedidoFalso({ email: "ana@example.com" }))
    await despuesDeResponder()

    expect(prismaMock.passwordResetToken.create).not.toHaveBeenCalled()
    expect(mockEnviarRecuperacion).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
    consola.mockRestore()
  })
})
