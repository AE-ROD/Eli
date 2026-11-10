import { describe, it, expect, vi, afterEach } from "vitest"
import { hashDeToken } from "./tokens"
import {
  DIAS_DE_VIGENCIA,
  claveDeReenvio,
  enlaceNuevo,
  estaVencida,
  mandarCorreoDeInvitacion,
  vencimientoDesde,
} from "./invitaciones-de-equipo"

const mockEnviarInvitacion = vi.fn(async (..._args: unknown[]) => null)
const mockBuscarNegocio = vi.fn(async (..._args: unknown[]) => ({ name: "Salón Uno" }))

// Hoisted por vitest: el módulo no llega a conectarse a la base ni a Resend.
vi.mock("@/lib/prisma", () => ({ prisma: { business: { findUnique: (...a: unknown[]) => mockBuscarNegocio(...a) } } }))
vi.mock("@/lib/email", () => ({ enviarInvitacionTrabajador: (...a: unknown[]) => mockEnviarInvitacion(...a) }))


const ahora = new Date("2026-10-26T15:00:00.000Z")

describe("vencimientoDesde", () => {
  it("vence a los siete días justos, como dice el correo", () => {
    expect(DIAS_DE_VIGENCIA).toBe(7)
    expect(vencimientoDesde(ahora).toISOString()).toBe("2026-11-02T15:00:00.000Z")
  })
})

describe("estaVencida", () => {
  it("vencida desde el instante en que vence: el mismo criterio que aceptar (expiresAt > ahora)", () => {
    expect(estaVencida({ expiresAt: new Date(ahora.getTime() - 1) }, ahora)).toBe(true)
    expect(estaVencida({ expiresAt: ahora }, ahora)).toBe(true)
    expect(estaVencida({ expiresAt: new Date(ahora.getTime() + 1) }, ahora)).toBe(false)
  })
})

describe("enlaceNuevo", () => {
  it("un token que sólo viaja en el correo, su hash para la base y el vencimiento", () => {
    const enlace = enlaceNuevo(ahora)

    expect(enlace.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(enlace.tokenHash).toBe(hashDeToken(enlace.token))
    expect(enlace.expiresAt).toEqual(vencimientoDesde(ahora))
  })

  it("cada uno es distinto: reenviar deja sin efecto el enlace anterior", () => {
    expect(enlaceNuevo(ahora).token).not.toBe(enlaceNuevo(ahora).token)
  })
})

describe("claveDeReenvio", () => {
  it("por negocio y por casilla, sin mayúsculas ni espacios", () => {
    expect(claveDeReenvio("negocio-1", " Ana@X.com ")).toBe("negocio-1:ana@x.com")
    expect(claveDeReenvio("negocio-2", "ana@x.com")).not.toBe(claveDeReenvio("negocio-1", "ana@x.com"))
  })
})

describe("mandarCorreoDeInvitacion", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  const datos = { token: "tok", businessId: "negocio-1", nombreDeRespaldo: "", email: "ana@x.com", nombre: "Ana", rol: "worker" }

  it("el enlace va a /unirse/<token> sobre NEXTAUTH_URL", async () => {
    vi.stubEnv("NEXTAUTH_URL", "https://eli.app")
    await mandarCorreoDeInvitacion(datos)
    expect(mockEnviarInvitacion).toHaveBeenCalledWith(expect.objectContaining({ enlaceAceptar: "https://eli.app/unirse/tok" }))
  })

  it("en producción sin NEXTAUTH_URL no manda un enlace a localhost, y no lanza (la invitación queda para reenviar)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.stubEnv("NEXTAUTH_URL", "")
    vi.stubEnv("NODE_ENV", "production")

    await expect(mandarCorreoDeInvitacion(datos)).resolves.toBeUndefined()
    expect(mockEnviarInvitacion).not.toHaveBeenCalled()
  })
})
