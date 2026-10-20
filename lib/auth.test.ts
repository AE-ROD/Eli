import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { JWT } from "next-auth/jwt"
import { actorDeSesion } from "@/lib/permisos"

const prismaMock = {
  user: { findUnique: vi.fn(), create: vi.fn() },
}

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

const MINUTO = 60 * 1000
const AHORA = new Date("2026-10-20T15:00:00Z").getTime()

// Lo que devuelve `buscarUsuario`: el usuario con su negocio y su membresía.
const negocio = { id: "negocio-1", name: "Barbería Uno", slug: "barberia-uno" }
const otroNegocio = { id: "negocio-2", name: "Spa Dos", slug: "spa-dos" }

function usuarioMiembro(rol: "admin" | "worker", extra: Record<string, unknown> = {}) {
  return {
    id: "usuario-1",
    name: "Carla",
    email: "carla@x.com",
    password: "hash",
    sesionesValidasDesde: null,
    business: null,
    memberships: [{ id: "miembro-1", role: rol, business: negocio }],
    ...extra,
  }
}

/** Un token de profesional emitido hace `haceMinutos` y revalidado entonces. */
function tokenDeProfesional(haceMinutos: number, extra: Partial<JWT> = {}): JWT {
  return {
    id: "usuario-1",
    email: "carla@x.com",
    role: "worker",
    businessId: "negocio-1",
    businessName: "Barbería Uno",
    businessSlug: "barberia-uno",
    memberId: "miembro-1",
    emitidoEn: AHORA - haceMinutos * MINUTO,
    revalidadoEn: AHORA - haceMinutos * MINUTO,
    ...extra,
  } as JWT
}

async function callbacks() {
  const { authOptions } = await import("./auth")
  return authOptions.callbacks!
}

/** Corre `jwt` como lo hace NextAuth al leer la sesión de una petición cualquiera. */
async function leerSesion(token: JWT) {
  const { jwt, session } = await callbacks()
  const nuevo = (await jwt!({ token } as unknown as Parameters<NonNullable<typeof jwt>>[0])) as JWT
  const sesion = await session!({
    session: { user: { name: "Carla", email: "carla@x.com" }, expires: "" },
    token: nuevo,
  } as unknown as Parameters<NonNullable<typeof session>>[0])
  return { token: nuevo, actor: actorDeSesion(sesion as never) }
}

describe("sesiones revocables (lib/auth.ts, callback jwt)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(AHORA)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("la sesión dura como máximo 7 días", async () => {
    const { authOptions } = await import("./auth")
    expect(authOptions.session?.maxAge).toBe(7 * 24 * 60 * 60)
  })

  it("dentro de los 5 minutos no consulta la base: el token sigue como está", async () => {
    const { actor } = await leerSesion(tokenDeProfesional(4))

    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
    expect(actor).toEqual({ rol: "worker", businessId: "negocio-1", memberId: "miembro-1" })
  })

  it("un miembro eliminado del equipo pierde el acceso en la siguiente revalidación", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(usuarioMiembro("worker", { memberships: [] }))

    const { token, actor } = await leerSesion(tokenDeProfesional(6))

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "usuario-1" } })
    )
    expect(actor).toBeNull()
    expect(token.businessId).toBeFalsy()
    expect(token.role).toBeFalsy()
    expect(token.memberId).toBeFalsy()
    // Se revalidó ahora: la próxima consulta es en 5 minutos, no en cada petición.
    expect(token.revalidadoEn).toBe(AHORA)
  })

  it("un cambio de rol se refleja en la siguiente revalidación", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(usuarioMiembro("admin"))

    const { actor } = await leerSesion(tokenDeProfesional(6))

    expect(actor).toEqual({ rol: "admin", businessId: "negocio-1", memberId: "miembro-1" })
  })

  it("si cambió el negocio, el token pasa al nuevo y no se queda con el viejo", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(
      usuarioMiembro("worker", { memberships: [{ id: "miembro-9", role: "worker", business: otroNegocio }] })
    )

    const { token, actor } = await leerSesion(tokenDeProfesional(6))

    expect(actor).toEqual({ rol: "worker", businessId: "negocio-2", memberId: "miembro-9" })
    expect(token.businessName).toBe("Spa Dos")
  })

  it("un usuario borrado pierde el acceso y el token deja de identificarlo", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null)

    const { token, actor } = await leerSesion(tokenDeProfesional(6))

    expect(actor).toBeNull()
    expect(token.id).toBeFalsy()
  })

  it("restablecer la contraseña cierra las sesiones emitidas antes", async () => {
    // El token se emitió hace 30 minutos; la contraseña se cambió hace 10.
    prismaMock.user.findUnique.mockResolvedValueOnce(
      usuarioMiembro("worker", { sesionesValidasDesde: new Date(AHORA - 10 * MINUTO) })
    )

    const { token, actor } = await leerSesion(tokenDeProfesional(30, { revalidadoEn: AHORA - 6 * MINUTO }))

    expect(actor).toBeNull()
    // Sin id, ni completar-perfil la acepta: no puede crear un negocio en una
    // cuenta cuya sesión ya se cerró.
    expect(token.id).toBeFalsy()
  })

  it("una sesión iniciada después del restablecimiento sigue valiendo", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(
      usuarioMiembro("worker", { sesionesValidasDesde: new Date(AHORA - 10 * MINUTO) })
    )

    const { actor } = await leerSesion(tokenDeProfesional(8))

    expect(actor).toEqual({ rol: "worker", businessId: "negocio-1", memberId: "miembro-1" })
  })

  it("un token de antes de este cambio (sin marcas) se revalida en la primera petición", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(usuarioMiembro("worker", { memberships: [] }))

    const { actor } = await leerSesion(tokenDeProfesional(0, { emitidoEn: undefined, revalidadoEn: undefined }))

    expect(prismaMock.user.findUnique).toHaveBeenCalled()
    expect(actor).toBeNull()
  })

  it("un token sin fecha de emisión no sobrevive a un restablecimiento", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(
      usuarioMiembro("worker", { sesionesValidasDesde: new Date(AHORA - 10 * MINUTO) })
    )

    const { actor } = await leerSesion(tokenDeProfesional(0, { emitidoEn: undefined, revalidadoEn: undefined }))

    expect(actor).toBeNull()
  })

  it("el login con credenciales marca la emisión y la revalidación", async () => {
    const { jwt } = await callbacks()
    const token = (await jwt!({
      token: { email: "carla@x.com" },
      user: {
        id: "usuario-1",
        name: "Carla",
        email: "carla@x.com",
        role: "worker",
        businessId: "negocio-1",
        businessName: "Barbería Uno",
        businessSlug: "barberia-uno",
        memberId: "miembro-1",
      },
      account: { provider: "credentials", type: "credentials", providerAccountId: "usuario-1" },
      trigger: "signIn",
    } as unknown as Parameters<NonNullable<typeof jwt>>[0])) as JWT

    expect(token.emitidoEn).toBe(AHORA)
    expect(token.revalidadoEn).toBe(AHORA)
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  })
})
