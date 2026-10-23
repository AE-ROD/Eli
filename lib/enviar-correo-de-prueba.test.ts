import { describe, it, expect, beforeEach, vi } from "vitest"
import { Prisma } from "@prisma/client"

const mockEnviarCorreoDePrueba = vi.fn()

vi.mock("@/lib/email", () => ({
  enviarCorreoDePrueba: (...args: unknown[]) => mockEnviarCorreoDePrueba(...args),
}))

const prismaMock = {
  correoDeCuenta: { create: vi.fn(), deleteMany: vi.fn() },
  business: { findUnique: vi.fn() },
}

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

const negocio = {
  id: "negocio-1",
  name: "Peluquería Sol",
  slug: "peluqueria-sol",
  timezone: "America/Santiago",
  createdAt: new Date("2026-10-20T15:00:00Z"),
  pruebaTerminaEl: new Date("2026-10-27T15:00:00Z"),
  recibeCorreosDePrueba: true,
  user: { id: "usuario-1", name: "Ana", email: "ana.privada@ejemplo.com", correosDesactivados: false },
  correosDeCuenta: [],
}

const consejo = { tipo: "consejo" as const, ultimoDia: "2026-10-27", diasRestantes: 4 }

function choqueDeUnico() {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { target: ["businessId", "tipo"] },
  })
}

describe("mandarCorreoDePrueba: el candado de CorreoDeCuenta", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("NEXTAUTH_SECRET", "secreto-de-prueba")
    vi.stubEnv("NEXTAUTH_URL", "https://eli.app")
    prismaMock.correoDeCuenta.create.mockResolvedValue({ id: "fila-1" })
    prismaMock.correoDeCuenta.deleteMany.mockResolvedValue({ count: 1 })
    mockEnviarCorreoDePrueba.mockResolvedValue({ data: { id: "correo-1" }, error: null, headers: null })
  })

  it("inserta la fila antes de enviar y la deja si el envío sale bien", async () => {
    const { mandarCorreoDePrueba } = await import("./enviar-correo-de-prueba")

    const resultado = await mandarCorreoDePrueba(negocio, consejo)

    expect(resultado).toBe("enviado")
    expect(prismaMock.correoDeCuenta.create).toHaveBeenCalledWith({
      data: { businessId: "negocio-1", tipo: "consejo" },
      select: { id: true },
    })
    expect(prismaMock.correoDeCuenta.create.mock.invocationCallOrder[0]).toBeLessThan(
      mockEnviarCorreoDePrueba.mock.invocationCallOrder[0],
    )
    expect(prismaMock.correoDeCuenta.deleteMany).not.toHaveBeenCalled()
  })

  it("arma los enlaces del panel, de reservas y de baja con NEXTAUTH_URL", async () => {
    const { mandarCorreoDePrueba } = await import("./enviar-correo-de-prueba")
    const { usuarioDelTokenDeBaja } = await import("./baja-de-correos")

    await mandarCorreoDePrueba(negocio, consejo)

    const [tipo, datos] = mockEnviarCorreoDePrueba.mock.calls[0]
    expect(tipo).toBe("consejo")
    expect(datos).toMatchObject({
      emailDueno: "ana.privada@ejemplo.com",
      enlacePanel: "https://eli.app/dashboard",
      enlaceReservas: "https://eli.app/reservar/peluqueria-sol",
      ultimoDia: "2026-10-27",
      diasRestantes: 4,
    })
    const token = (datos.enlaceDeBaja as string).replace("https://eli.app/baja-de-correos/", "")
    expect(usuarioDelTokenDeBaja(token)).toBe("usuario-1")
  })

  it("con la fila ya existente (P2002) no envía: 'ya-enviado'", async () => {
    const { mandarCorreoDePrueba } = await import("./enviar-correo-de-prueba")
    prismaMock.correoDeCuenta.create.mockRejectedValueOnce(choqueDeUnico())

    expect(await mandarCorreoDePrueba(negocio, consejo)).toBe("ya-enviado")
    expect(mockEnviarCorreoDePrueba).not.toHaveBeenCalled()
    expect(prismaMock.correoDeCuenta.deleteMany).not.toHaveBeenCalled()
  })

  it("si la base falla al insertar, no envía y cuenta un fallo", async () => {
    const { mandarCorreoDePrueba } = await import("./enviar-correo-de-prueba")
    vi.spyOn(console, "error").mockImplementation(() => {})
    prismaMock.correoDeCuenta.create.mockRejectedValueOnce(new Error("conexión caída"))

    expect(await mandarCorreoDePrueba(negocio, consejo)).toBe("fallido")
    expect(mockEnviarCorreoDePrueba).not.toHaveBeenCalled()
  })

  it.each([
    ["Resend responde { error }", () => mockEnviarCorreoDePrueba.mockResolvedValueOnce({ data: null, error: { name: "rate_limit_exceeded", message: "ana.privada@ejemplo.com", statusCode: 429 }, headers: null })],
    ["no hay RESEND_API_KEY (null)", () => mockEnviarCorreoDePrueba.mockResolvedValueOnce(null)],
    ["el envío lanza", () => mockEnviarCorreoDePrueba.mockRejectedValueOnce(new Error("red"))],
  ])("si %s, borra la fila para reintentar y cuenta un fallo, sin datos personales en el log", async (_caso, preparar) => {
    const { mandarCorreoDePrueba } = await import("./enviar-correo-de-prueba")
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    preparar()

    expect(await mandarCorreoDePrueba(negocio, consejo)).toBe("fallido")
    expect(prismaMock.correoDeCuenta.deleteMany).toHaveBeenCalledWith({ where: { businessId: "negocio-1", tipo: "consejo" } })
    const escrito = JSON.stringify(log.mock.calls)
    expect(escrito).not.toContain("ana.privada")
    expect(escrito).not.toContain("Peluquería")
  })

  it("sin NEXTAUTH_SECRET no hay enlace de baja: no envía y libera la fila", async () => {
    const { mandarCorreoDePrueba } = await import("./enviar-correo-de-prueba")
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.stubEnv("NEXTAUTH_SECRET", "")

    expect(await mandarCorreoDePrueba(negocio, consejo)).toBe("fallido")
    expect(mockEnviarCorreoDePrueba).not.toHaveBeenCalled()
    expect(prismaMock.correoDeCuenta.deleteMany).toHaveBeenCalled()
  })
})

describe("enviarBienvenida", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("NEXTAUTH_SECRET", "secreto-de-prueba")
    prismaMock.correoDeCuenta.create.mockResolvedValue({ id: "fila-1" })
    mockEnviarCorreoDePrueba.mockResolvedValue({ data: { id: "correo-1" }, error: null, headers: null })
  })

  it("manda la bienvenida con el fin de la prueba en la zona del negocio", async () => {
    const { enviarBienvenida } = await import("./enviar-correo-de-prueba")
    prismaMock.business.findUnique.mockResolvedValue(negocio)

    expect(await enviarBienvenida("negocio-1")).toBe("enviado")
    expect(prismaMock.business.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "negocio-1" } }))
    expect(mockEnviarCorreoDePrueba.mock.calls[0][0]).toBe("bienvenida")
    expect(mockEnviarCorreoDePrueba.mock.calls[0][1].ultimoDia).toBe("2026-10-27")
  })

  it.each([
    ["el negocio no existe", null],
    ["el negocio no recibe correos de prueba", { ...negocio, recibeCorreosDePrueba: false }],
    ["el dueño se dio de baja", { ...negocio, user: { ...negocio.user, correosDesactivados: true } }],
  ])("si %s, no hace nada", async (_caso, encontrado) => {
    const { enviarBienvenida } = await import("./enviar-correo-de-prueba")
    prismaMock.business.findUnique.mockResolvedValue(encontrado)

    expect(await enviarBienvenida("negocio-1")).toBe("no-corresponde")
    expect(prismaMock.correoDeCuenta.create).not.toHaveBeenCalled()
    expect(mockEnviarCorreoDePrueba).not.toHaveBeenCalled()
  })

  it("nunca lanza: si la base falla al leer, devuelve 'fallido'", async () => {
    const { enviarBienvenida } = await import("./enviar-correo-de-prueba")
    vi.spyOn(console, "error").mockImplementation(() => {})
    prismaMock.business.findUnique.mockRejectedValue(new Error("conexión caída"))

    await expect(enviarBienvenida("negocio-1")).resolves.toBe("fallido")
  })
})
