import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { NextRequest } from "next/server"

const mockGetServerSession = vi.fn()
vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockVerificarLimite = vi.fn()
vi.mock("@/lib/rate-limit", () => ({
  obtenerIp: () => "203.0.113.7",
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
}))

const mockEnviarSolicitudASoporte = vi.fn()
const mockEnviarAcuseDeSoporte = vi.fn()
vi.mock("@/lib/email", () => ({
  enviarSolicitudASoporte: (...args: unknown[]) => mockEnviarSolicitudASoporte(...args),
  enviarAcuseDeSoporte: (...args: unknown[]) => mockEnviarAcuseDeSoporte(...args),
}))

const mockPrisma = {
  user: { findUnique: vi.fn() },
  business: { findUnique: vi.fn() },
  solicitudDeSoporte: { create: vi.fn() },
}
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }))

/**
 * Un pedido como el que manda el formulario: JSON, desde el mismo host. El
 * cuerpo va como un stream de verdad, que es lo que lee `cuerpoConTope`; un
 * `string` se manda tal cual (para probar tamaños), lo demás como JSON.
 */
const pedido = (cuerpo: unknown, cabeceras: Record<string, string> = {}) =>
  ({
    headers: new Headers({ "content-type": "application/json", host: "eli.test", "user-agent": "Prueba/1.0", ...cabeceras }),
    body: new Response(typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo)).body,
  }) as unknown as NextRequest

const enviar = async (cuerpo: unknown, cabeceras?: Record<string, string>) => {
  const { POST } = await import("./route")
  return POST(pedido(cuerpo, cabeceras))
}

const valida = {
  tipo: "falla",
  area: "agenda",
  asunto: "No carga la agenda",
  descripcion: "Al abrir la agenda queda la pantalla en blanco.",
  dondeOcurrio: "/dashboard/agenda",
}

const anonima = { ...valida, nombre: "Ana Pérez", email: "ana@ejemplo.com" }

const sesion = {
  user: {
    id: "usuario-1",
    name: "Nombre del token",
    email: "token@ejemplo.com",
    role: "owner",
    businessId: "negocio-1",
    businessName: "Mi negocio",
    memberId: null,
  },
}

/** Lo que devuelve `create`: el número lo pone la base. */
function guardadaCon(data: Record<string, unknown>) {
  return { numero: 123, createdAt: new Date("2026-10-26T12:00:00Z"), dondeOcurrio: null, ...data }
}

describe("POST /api/soporte", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("SOPORTE_EMAIL", "soporte@eli.test")
    mockGetServerSession.mockResolvedValue(null)
    mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 4 })
    mockEnviarSolicitudASoporte.mockResolvedValue({ data: { id: "c1" }, error: null })
    mockEnviarAcuseDeSoporte.mockResolvedValue({ data: { id: "c2" }, error: null })
    mockPrisma.solicitudDeSoporte.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
      guardadaCon(data),
    )
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe("sin sesión", () => {
    it("guarda con nombre y email del cuerpo, sin negocio ni usuario, y responde 201 con el número", async () => {
      const respuesta = await enviar(anonima)

      expect(respuesta.status).toBe(201)
      expect(await respuesta.json()).toEqual({ numero: "#000123" })
      const { data } = mockPrisma.solicitudDeSoporte.create.mock.calls[0][0]
      expect(data).toMatchObject({
        tipo: "falla",
        area: "agenda",
        nombre: "Ana Pérez",
        email: "ana@ejemplo.com",
        businessId: null,
        userId: null,
        userAgent: "Prueba/1.0",
      })
    })

    it.each([
      ["sin nombre", { ...valida, email: "ana@ejemplo.com" }, "Escribe tu nombre"],
      ["nombre vacío", { ...anonima, nombre: "   " }, "Escribe tu nombre"],
      ["sin correo", { ...valida, nombre: "Ana" }, "Escribe tu correo"],
      ["correo vacío", { ...anonima, email: "" }, "Escribe tu correo"],
      ["correo inválido", { ...anonima, email: "no-es-email" }, "Escribe un correo válido"],
    ])("%s: 400 y no guarda", async (_caso, cuerpo, mensaje) => {
      const respuesta = await enviar(cuerpo)

      expect(respuesta.status).toBe(400)
      expect((await respuesta.json()).error).toBe(mensaje)
      expect(mockPrisma.solicitudDeSoporte.create).not.toHaveBeenCalled()
    })

    it("ignora un businessId o userId que mande el cliente", async () => {
      await enviar({ ...anonima, businessId: "negocio-ajeno", userId: "usuario-ajeno" })

      const { data } = mockPrisma.solicitudDeSoporte.create.mock.calls[0][0]
      expect(data.businessId).toBeNull()
      expect(data.userId).toBeNull()
    })

    it("cuenta el límite de solicitudes sólo por IP", async () => {
      await enviar(anonima)

      const deSolicitudes = mockVerificarLimite.mock.calls.filter(([tipo]) => tipo === "soporte")
      expect(deSolicitudes).toEqual([["soporte", "ip:203.0.113.7"]])
    })
  })

  describe("con sesión", () => {
    beforeEach(() => {
      mockGetServerSession.mockResolvedValue(sesion)
      mockPrisma.user.findUnique.mockResolvedValue({ id: "usuario-1", name: "Dueña Real", email: "duena@ejemplo.com" })
      mockPrisma.business.findUnique.mockResolvedValue({ id: "negocio-1", name: "Mi negocio" })
    })

    it("nombre, email y negocio salen de la sesión y la base: lo del cliente se ignora", async () => {
      const respuesta = await enviar({
        ...valida,
        nombre: "Impostor",
        email: "impostor@ejemplo.com",
        businessId: "negocio-ajeno",
        userId: "usuario-ajeno",
      })

      expect(respuesta.status).toBe(201)
      expect(mockPrisma.business.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "negocio-1" } }),
      )
      const { data } = mockPrisma.solicitudDeSoporte.create.mock.calls[0][0]
      expect(data).toMatchObject({
        nombre: "Dueña Real",
        email: "duena@ejemplo.com",
        businessId: "negocio-1",
        userId: "usuario-1",
      })
    })

    it("no exige nombre ni email en el cuerpo", async () => {
      const respuesta = await enviar(valida)

      expect(respuesta.status).toBe(201)
    })

    it("cuenta el límite de solicitudes sólo por usuario, no por IP: un wifi compartido no bloquea al local", async () => {
      await enviar(valida)

      const deSolicitudes = mockVerificarLimite.mock.calls.filter(([tipo]) => tipo === "soporte")
      expect(deSolicitudes).toEqual([["soporte", "usuario:usuario-1"]])
    })

    it("con la IP agotada por otros, el usuario con sesión igual puede escribir", async () => {
      mockVerificarLimite.mockImplementation(async (_tipo: string, clave: string) =>
        clave.startsWith("ip:") ? { permitido: false, restantes: 0 } : { permitido: true, restantes: 4 },
      )

      expect((await enviar(valida)).status).toBe(201)
    })

    it("usuario de la sesión que ya no existe: 401 con mensaje claro y no guarda", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null)

      const respuesta = await enviar(valida)

      expect(respuesta.status).toBe(401)
      expect((await respuesta.json()).error).toMatch(/sesión/)
      expect(mockPrisma.solicitudDeSoporte.create).not.toHaveBeenCalled()
      expect(mockEnviarAcuseDeSoporte).not.toHaveBeenCalled()
    })

    it("límite por usuario agotado: 429 y no guarda", async () => {
      mockVerificarLimite.mockImplementation(async (_tipo: string, clave: string) =>
        clave.startsWith("usuario:") ? { permitido: false, restantes: 0 } : { permitido: true, restantes: 4 },
      )

      const respuesta = await enviar(valida)

      expect(respuesta.status).toBe(429)
      expect(mockPrisma.solicitudDeSoporte.create).not.toHaveBeenCalled()
    })

    it("sesión sin negocio (perfil sin completar): guarda con el usuario y sin negocio", async () => {
      mockGetServerSession.mockResolvedValue({ user: { ...sesion.user, role: null, businessId: "" } })

      await enviar(valida)

      expect(mockPrisma.business.findUnique).not.toHaveBeenCalled()
      const { data } = mockPrisma.solicitudDeSoporte.create.mock.calls[0][0]
      expect(data).toMatchObject({ businessId: null, userId: "usuario-1" })
    })

    it("el aviso a soporte lleva el negocio y responde a la dirección de la cuenta", async () => {
      await enviar(valida)

      const aviso = mockEnviarSolicitudASoporte.mock.calls[0][0]
      expect(aviso.para).toBe("soporte@eli.test")
      expect(aviso.responderA).toBe("duena@ejemplo.com")
      expect(aviso.detalle).toContainEqual(["Negocio", "Mi negocio (negocio-1)"])
    })
  })

  describe("validación", () => {
    it.each([
      ["tipo desconocido", { ...anonima, tipo: "queja" }, "Elige si es una falla, un reclamo o una consulta"],
      ["sin tipo", { ...anonima, tipo: undefined }, "Elige si es una falla, un reclamo o una consulta"],
      ["área desconocida", { ...anonima, area: "cocina" }, "Elige un área"],
      ["sin área", { ...anonima, area: undefined }, "Elige un área"],
      ["falla sin asunto", { ...anonima, asunto: "  " }, "Cuéntanos en pocas palabras qué pasó"],
      ["reclamo sin asunto", { ...anonima, tipo: "reclamo", asunto: "" }, "Cuéntanos en pocas palabras de qué se trata"],
      ["consulta sin asunto", { ...anonima, tipo: "consulta", asunto: "" }, "Escribe tu pregunta en pocas palabras"],
      ["asunto corto", { ...anonima, asunto: "ab" }, "Escribe al menos 3 caracteres"],
      ["asunto largo", { ...anonima, asunto: "a".repeat(121) }, "Usa como máximo 120 caracteres"],
      ["falla sin descripción", { ...anonima, descripcion: "" }, "Cuéntanos el detalle de lo que pasó"],
      ["reclamo sin descripción", { ...anonima, tipo: "reclamo", descripcion: "" }, "Cuéntanos qué pasó"],
      [
        "consulta sin descripción",
        { ...anonima, tipo: "consulta", descripcion: "" },
        "Cuéntanos un poco más sobre tu pregunta",
      ],
      ["descripción corta", { ...anonima, descripcion: "corta" }, "Cuéntanos un poco más (al menos 10 caracteres)"],
      ["descripción larga", { ...anonima, descripcion: "a".repeat(4001) }, "Usa como máximo 4000 caracteres"],
      ["dónde ocurrió largo", { ...anonima, dondeOcurrio: "a".repeat(301) }, "Usa como máximo 300 caracteres"],
    ])("%s: 400 con mensaje en español", async (_caso, cuerpo, mensaje) => {
      const respuesta = await enviar(cuerpo)

      expect(respuesta.status).toBe(400)
      expect((await respuesta.json()).error).toBe(mensaje)
      expect(mockPrisma.solicitudDeSoporte.create).not.toHaveBeenCalled()
    })

    it("cuerpo que no es un objeto: 400", async () => {
      expect((await enviar(null)).status).toBe(400)
      expect((await enviar([1, 2])).status).toBe(400)
    })

    it("dónde ocurrió vacío se guarda como null", async () => {
      await enviar({ ...anonima, dondeOcurrio: "   " })

      expect(mockPrisma.solicitudDeSoporte.create.mock.calls[0][0].data.dondeOcurrio).toBeNull()
    })
  })

  describe("campo trampa", () => {
    it("con valor: 201 falso con un número creíble, sin guardar ni enviar correos", async () => {
      const respuesta = await enviar({ ...anonima, sitio_web: "https://spam.example" })

      expect(respuesta.status).toBe(201)
      const { numero } = await respuesta.json()
      expect(numero).toMatch(/^#\d{6}$/)
      expect(numero).not.toBe("#000000")
      expect(mockPrisma.solicitudDeSoporte.create).not.toHaveBeenCalled()
      expect(mockEnviarSolicitudASoporte).not.toHaveBeenCalled()
      expect(mockEnviarAcuseDeSoporte).not.toHaveBeenCalled()
    })

    it("vacío: sigue normal", async () => {
      expect((await enviar({ ...anonima, sitio_web: "" })).status).toBe(201)
    })
  })

  describe("correos", () => {
    it("manda el aviso a soporte y el acuse al usuario", async () => {
      await enviar(anonima)

      expect(mockEnviarSolicitudASoporte).toHaveBeenCalledTimes(1)
      const aviso = mockEnviarSolicitudASoporte.mock.calls[0][0]
      expect(aviso).toMatchObject({ para: "soporte@eli.test", responderA: "ana@ejemplo.com", numero: "#000123" })
      expect(aviso.detalle).toContainEqual(["Negocio", "Sin negocio"])

      const acuse = mockEnviarAcuseDeSoporte.mock.calls[0][0]
      expect(acuse).toMatchObject({ para: "ana@ejemplo.com", responderA: "soporte@eli.test", numero: "#000123" })
    })

    it("el acuse no repite el texto que escribió la persona", async () => {
      await enviar(anonima)

      const acuse = JSON.stringify(mockEnviarAcuseDeSoporte.mock.calls[0][0])
      expect(acuse).not.toContain(anonima.asunto)
      expect(acuse).not.toContain(anonima.descripcion)
    })

    it("si el envío lanza, la solicitud ya quedó y responde 201", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      mockEnviarSolicitudASoporte.mockRejectedValue(new Error("Resend caído"))
      mockEnviarAcuseDeSoporte.mockRejectedValue(new Error("Resend caído"))

      const respuesta = await enviar(anonima)

      expect(respuesta.status).toBe(201)
      expect(await respuesta.json()).toEqual({ numero: "#000123" })
      expect(mockPrisma.solicitudDeSoporte.create).toHaveBeenCalledTimes(1)
      expect(console.error).toHaveBeenCalled()
    })

    it("si Resend devuelve { error }, se registra y responde 201", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      mockEnviarSolicitudASoporte.mockResolvedValue({ data: null, error: { name: "validation_error", message: "x" } })

      const respuesta = await enviar(anonima)

      expect(respuesta.status).toBe(201)
      expect(console.error).toHaveBeenCalled()
    })

    it("sin SOPORTE_EMAIL: guarda, manda el acuse, no el aviso, y avisa en el log", async () => {
      vi.stubEnv("SOPORTE_EMAIL", "")
      const aviso = vi.spyOn(console, "warn").mockImplementation(() => {})

      const respuesta = await enviar(anonima)

      expect(respuesta.status).toBe(201)
      expect(mockEnviarSolicitudASoporte).not.toHaveBeenCalled()
      expect(mockEnviarAcuseDeSoporte).toHaveBeenCalledTimes(1)
      expect(mockEnviarAcuseDeSoporte.mock.calls[0][0].responderA).toBeNull()
      expect(aviso).toHaveBeenCalled()
    })

    it("pide el tope del acuse por el correo de destino, normalizado", async () => {
      await enviar({ ...anonima, email: "  Ana@Ejemplo.com " })

      expect(mockVerificarLimite).toHaveBeenCalledWith("acuseDeSoporte", "email:ana@ejemplo.com")
    })

    it("tope del acuse agotado: guarda, avisa a soporte y responde 201, pero no manda el acuse", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {})
      mockVerificarLimite.mockImplementation(async (tipo: string) =>
        tipo === "acuseDeSoporte" ? { permitido: false, restantes: 0 } : { permitido: true, restantes: 4 },
      )

      const respuesta = await enviar(anonima)

      expect(respuesta.status).toBe(201)
      expect(mockPrisma.solicitudDeSoporte.create).toHaveBeenCalledTimes(1)
      expect(mockEnviarSolicitudASoporte).toHaveBeenCalledTimes(1)
      expect(mockEnviarAcuseDeSoporte).not.toHaveBeenCalled()
    })

    it("con sesión, el tope del acuse se cuenta por el correo de la cuenta", async () => {
      mockGetServerSession.mockResolvedValue(sesion)
      mockPrisma.user.findUnique.mockResolvedValue({ id: "usuario-1", name: "Dueña", email: "duena@ejemplo.com" })
      mockPrisma.business.findUnique.mockResolvedValue({ id: "negocio-1", name: "Mi negocio" })

      await enviar({ ...valida, email: "otra@ejemplo.com" })

      expect(mockVerificarLimite).toHaveBeenCalledWith("acuseDeSoporte", "email:duena@ejemplo.com")
    })

    it("si falla guardar: 500 y no manda correos", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {})
      mockPrisma.solicitudDeSoporte.create.mockRejectedValue(new Error("base caída"))

      const respuesta = await enviar(anonima)

      expect(respuesta.status).toBe(500)
      expect(mockEnviarSolicitudASoporte).not.toHaveBeenCalled()
      expect(mockEnviarAcuseDeSoporte).not.toHaveBeenCalled()
    })
  })

  describe("resguardos del pedido", () => {
    it("sin Content-Type JSON: 415", async () => {
      expect((await enviar(anonima, { "content-type": "text/plain" })).status).toBe(415)
      expect(mockPrisma.solicitudDeSoporte.create).not.toHaveBeenCalled()
    })

    it("con Origin ajeno: 403", async () => {
      expect((await enviar(anonima, { origin: "https://ajeno.example" })).status).toBe(403)
      expect(mockPrisma.solicitudDeSoporte.create).not.toHaveBeenCalled()
    })

    it("con Origin propio: pasa", async () => {
      expect((await enviar(anonima, { origin: "https://eli.test" })).status).toBe(201)
    })

    it("Content-Length de más de 32 KB: 413 sin leer el cuerpo ni contar el límite", async () => {
      const respuesta = await enviar(anonima, { "content-length": String(32 * 1024 + 1) })

      expect(respuesta.status).toBe(413)
      expect(mockVerificarLimite).not.toHaveBeenCalled()
      expect(mockPrisma.solicitudDeSoporte.create).not.toHaveBeenCalled()
    })

    it("sin Content-Length pero con un cuerpo de más de 32 KB: 413", async () => {
      const grande = JSON.stringify({ ...anonima, descripcion: "a".repeat(40 * 1024) })

      const respuesta = await enviar(grande)

      expect(respuesta.status).toBe(413)
      expect(mockPrisma.solicitudDeSoporte.create).not.toHaveBeenCalled()
    })

    it("JSON roto: 400", async () => {
      expect((await enviar("{no es json")).status).toBe(400)
    })

    it("límite por IP agotado: 429 y no guarda", async () => {
      mockVerificarLimite.mockResolvedValue({ permitido: false, restantes: 0 })

      const respuesta = await enviar(anonima)

      expect(respuesta.status).toBe(429)
      expect(mockPrisma.solicitudDeSoporte.create).not.toHaveBeenCalled()
    })
  })
})
