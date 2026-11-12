import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import type { JWT } from "next-auth/jwt"
import type { Session } from "next-auth"
import { actorDeSesion, puedeCambiarDePlan, puedeGestionarSedes, puedeInvitarAlEquipo } from "@/lib/permisos"
// bcryptjs guarda `setImmediate` al cargarse: si lo cargara `./auth` por
// primera vez con los relojes falsos de abajo, sus comparaciones no
// terminarían nunca. Cargado acá, antes, se queda con el de verdad.
import "bcryptjs"

const prismaMock = {
  user: { findUnique: vi.fn(), create: vi.fn() },
}

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

const mockVerificarLimite = vi.fn(async (..._args: unknown[]) => ({ permitido: true, restantes: 10 }))
vi.mock("@/lib/rate-limit", async (original) => ({
  ...(await original<typeof import("@/lib/rate-limit")>()),
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
}))

const cuentaGoogle = { provider: "google", type: "oauth", providerAccountId: "g-1" }

const MINUTO = 60 * 1000
const AHORA = new Date("2026-10-20T15:00:00Z").getTime()

// Lo que devuelve `buscarUsuario`: el usuario con su negocio y su membresía.
const negocio = { id: "negocio-1", name: "Barbería Uno", slug: "barberia-uno", plan: "equipo" }
const otroNegocio = { id: "negocio-2", name: "Spa Dos", slug: "spa-dos", plan: "equipo" }

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
    // Un test cuyo token se revoca antes de llegar a la base deja su
    // `mockResolvedValueOnce` sin consumir: que no se filtre al siguiente.
    prismaMock.user.findUnique.mockReset()
  })

  it("la sesión dura como máximo 7 días", async () => {
    const { authOptions } = await import("./auth")
    expect(authOptions.session?.maxAge).toBe(7 * 24 * 60 * 60)
  })

  it("dentro de los 5 minutos no consulta la base: el token sigue como está", async () => {
    const { actor } = await leerSesion(tokenDeProfesional(4))

    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
    expect(actor).toEqual({ rol: "worker", businessId: "negocio-1", memberId: "miembro-1", plan: null })
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

    expect(actor).toEqual({ rol: "admin", businessId: "negocio-1", memberId: "miembro-1", plan: "equipo" })
  })

  it("si cambió el negocio, el token pasa al nuevo y no se queda con el viejo", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(
      usuarioMiembro("worker", { memberships: [{ id: "miembro-9", role: "worker", business: otroNegocio }] })
    )

    const { token, actor } = await leerSesion(tokenDeProfesional(6))

    expect(actor).toEqual({ rol: "worker", businessId: "negocio-2", memberId: "miembro-9", plan: "equipo" })
    expect(token.businessName).toBe("Spa Dos")
  })

  it("un usuario borrado pierde el acceso y el token deja de identificarlo", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null)

    const { token, actor } = await leerSesion(tokenDeProfesional(6))

    expect(actor).toBeNull()
    expect(token.id).toBeFalsy()
  })

  it.each([
    ["el usuario se borró", null],
    ["la contraseña se restableció después de emitir el token", usuarioMiembro("worker", { sesionesValidasDesde: new Date(AHORA - 1 * MINUTO) })],
  ])("al revocar (%s) el token tampoco conserva email, nombre ni foto", async (_caso, usuario) => {
    prismaMock.user.findUnique.mockResolvedValueOnce(usuario)

    const { token } = await leerSesion(
      tokenDeProfesional(6, { name: "Carla", picture: "https://foto/carla.png" })
    )

    // Con el email adentro, cualquier endpoint que identifique por correo
    // (aceptar una invitación) seguía reconociendo a la persona.
    expect(token.id).toBeFalsy()
    expect(token.email).toBeFalsy()
    expect(token.name).toBeFalsy()
    expect(token.picture).toBeFalsy()
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

    expect(actor).toEqual({ rol: "worker", businessId: "negocio-1", memberId: "miembro-1", plan: "equipo" })
  })

  it("un token de antes de este cambio (sin fecha de emisión) cuenta como emitido en 0: vencido y revocado", async () => {

    const { token, actor } = await leerSesion(
      tokenDeProfesional(0, { emitidoEn: undefined, revalidadoEn: undefined })
    )

    // Sin fecha de emisión no se puede saber cuánto vivió: falla cerrado.
    expect(actor).toBeNull()
    expect(token.id).toBeFalsy()
  })

  it("vida máxima absoluta: pasados los 7 días desde que se emitió, se revoca aunque se haya ido renovando", async () => {
    const sieteDiasYUnMinuto = 7 * 24 * 60 + 1

    const { token, actor } = await leerSesion(
      tokenDeProfesional(sieteDiasYUnMinuto, { revalidadoEn: AHORA - 1 * MINUTO })
    )

    expect(actor).toBeNull()
    expect(token.id).toBeFalsy()
    expect(token.email).toBeFalsy()
  })

  it("vida máxima absoluta: con menos de 7 días desde la emisión sigue valiendo", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(usuarioMiembro("worker"))
    const sieteDiasMenosUnMinuto = 7 * 24 * 60 - 1

    const { actor } = await leerSesion(
      tokenDeProfesional(sieteDiasMenosUnMinuto, { revalidadoEn: AHORA - 6 * MINUTO })
    )

    expect(actor).toEqual({ rol: "worker", businessId: "negocio-1", memberId: "miembro-1", plan: "equipo" })
  })

  it("un token sin fecha de emisión no sobrevive a un restablecimiento", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(
      usuarioMiembro("worker", { sesionesValidasDesde: new Date(AHORA - 10 * MINUTO) })
    )

    const { actor } = await leerSesion(tokenDeProfesional(0, { emitidoEn: undefined, revalidadoEn: undefined }))

    expect(actor).toBeNull()
  })

  it("el rubro del negocio llega a la sesión y al actor al revalidar", async () => {
    const clinica = { id: "negocio-1", name: "Clínica Aurora", slug: "clinica-aurora", type: "odontologia", plan: "equipo" }
    prismaMock.user.findUnique.mockResolvedValueOnce(
      usuarioMiembro("worker", { memberships: [{ id: "miembro-1", role: "worker", business: clinica }] })
    )

    const { token, actor } = await leerSesion(tokenDeProfesional(6))

    expect(token.rubro).toBe("odontologia")
    expect(actor).toEqual({ rol: "worker", businessId: "negocio-1", memberId: "miembro-1", rubro: "odontologia", plan: "equipo" })
  })

  it("el rubro es el del negocio del contexto elegido, nunca el de otro contexto de la cuenta", async () => {
    const propio = { id: "negocio-3", name: "Salón Tres", slug: "salon-tres", type: "salon", plan: "independiente" }
    const clinicaAjena = { id: "negocio-1", name: "Clínica", slug: "clinica", type: "odontologia", plan: "equipo" }
    const usuario = usuarioMiembro("worker", { business: propio, memberships: [{ id: "miembro-1", role: "worker", business: clinicaAjena }] })

    prismaMock.user.findUnique.mockResolvedValueOnce(usuario)
    const comoDueña = await leerSesion(tokenDeProfesional(6, { contexto: "dueño:negocio-3" }))
    expect(comoDueña.actor).toEqual({ rol: "owner", businessId: "negocio-3", memberId: null, rubro: "salon", plan: "independiente" })

    prismaMock.user.findUnique.mockResolvedValueOnce(usuario)
    const comoOdontologa = await leerSesion(tokenDeProfesional(6, { contexto: "miembro:miembro-1" }))
    expect(comoOdontologa.actor).toEqual({ rol: "worker", businessId: "negocio-1", memberId: "miembro-1", rubro: "odontologia", plan: "equipo" })
  })

  it("un token de antes del rubro sigue valiendo, sin rubro (no dental), hasta la próxima revalidación", async () => {
    const { token, actor } = await leerSesion(tokenDeProfesional(4))

    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
    expect(token.rubro).toBeUndefined()
    expect(actor).toEqual({ rol: "worker", businessId: "negocio-1", memberId: "miembro-1", plan: null })
  })

  it("al quedarse sin negocio, el token pierde también el rubro", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(usuarioMiembro("worker", { memberships: [] }))

    const { token } = await leerSesion(tokenDeProfesional(6, { rubro: "odontologia" }))

    expect(token.rubro).toBeNull()
  })

  it("el login con credenciales lleva el rubro que devolvió `authorize`", async () => {
    const { jwt } = await callbacks()
    const token = (await jwt!({
      token: { email: "carla@x.com" },
      user: { id: "usuario-1", name: "Carla", email: "carla@x.com", role: "owner", businessId: "negocio-1", rubro: "odontologia", memberId: null },
      account: { provider: "credentials", type: "credentials", providerAccountId: "usuario-1" },
      trigger: "signIn",
    } as unknown as Parameters<NonNullable<typeof jwt>>[0])) as JWT

    expect(token.rubro).toBe("odontologia")
  })

  it("el plan del negocio llega al token, a la sesión y al actor al revalidar", async () => {
    const independiente = { id: "negocio-1", name: "Spa Ana", slug: "spa-ana", type: "salon", plan: "independiente" }
    prismaMock.user.findUnique.mockResolvedValueOnce(usuarioMiembro("worker", { business: independiente, memberships: [] }))

    const { token, actor } = await leerSesion(tokenDeProfesional(6, { contexto: "dueño:negocio-1" }))

    expect(token.plan).toBe("independiente")
    expect(actor).toEqual({ rol: "owner", businessId: "negocio-1", memberId: null, rubro: "salon", plan: "independiente" })
  })

  it("la sesión lleva el plan en session.user.plan", async () => {
    const { session } = await callbacks()
    const sesion = await session!({
      session: { user: { name: "Carla", email: "carla@x.com" }, expires: "" },
      token: tokenDeProfesional(1, { plan: "equipo" }),
    } as unknown as Parameters<NonNullable<typeof session>>[0])

    expect((sesion as Session).user.plan).toBe("equipo")
  })

  it("el plan es el del negocio del contexto elegido: una clínica Equipo y su propio negocio Independiente, cada uno con lo suyo", async () => {
    const usuario = usuarioMiembro("worker", {
      business: { id: "negocio-3", name: "Salón Tres", slug: "salon-tres", type: "salon", plan: "independiente" },
      memberships: [{ id: "miembro-1", role: "admin", business: { id: "negocio-1", name: "Clínica", slug: "clinica", type: "odontologia", plan: "equipo" } }],
    })

    prismaMock.user.findUnique.mockResolvedValueOnce(usuario)
    const comoDueña = await leerSesion(tokenDeProfesional(6, { contexto: "dueño:negocio-3" }))
    expect(comoDueña.token.plan).toBe("independiente")
    expect(puedeGestionarSedes(comoDueña.actor)).toBe(true)
    expect(puedeInvitarAlEquipo(comoDueña.actor)).toBe(false)

    prismaMock.user.findUnique.mockResolvedValueOnce(usuario)
    const comoEncargada = await leerSesion(tokenDeProfesional(6, { contexto: "miembro:miembro-1" }))
    expect(comoEncargada.token.plan).toBe("equipo")
    expect(puedeInvitarAlEquipo(comoEncargada.actor)).toBe(true)
    expect(puedeGestionarSedes(comoEncargada.actor)).toBe(false)
  })

  it("un cambio de plan en la base se refleja en la siguiente revalidación", async () => {
    const pasaAIndependiente = { ...negocio, plan: "independiente" }
    prismaMock.user.findUnique.mockResolvedValueOnce(usuarioMiembro("worker", { business: pasaAIndependiente, memberships: [] }))

    const { token, actor } = await leerSesion(tokenDeProfesional(6, { contexto: "dueño:negocio-1", plan: "equipo" }))

    expect(token.plan).toBe("independiente")
    expect(puedeInvitarAlEquipo(actor)).toBe(false)
    expect(puedeGestionarSedes(actor)).toBe(true)
    expect(puedeCambiarDePlan(actor)).toBe(true)
  })

  it.each([
    ["uno que la base no conoce", "pro"],
    ["con otras mayúsculas", "Equipo"],
    ["vacío", ""],
    ["sin plan", null],
    ["algo que no es texto", { id: "equipo" }],
  ])("un plan %s queda en null y no habilita nada que dependa del plan (falla cerrado)", async (_caso, plan) => {
    const raro = { id: "negocio-1", name: "Spa Ana", slug: "spa-ana", type: "salon", plan }
    prismaMock.user.findUnique.mockResolvedValueOnce(usuarioMiembro("worker", { business: raro, memberships: [] }))

    const { token, actor } = await leerSesion(tokenDeProfesional(6, { contexto: "dueño:negocio-1", plan: "equipo" }))

    expect(token.plan).toBeNull()
    expect(actor).toMatchObject({ rol: "owner", businessId: "negocio-1", plan: null })
    expect(puedeInvitarAlEquipo(actor)).toBe(false)
    expect(puedeGestionarSedes(actor)).toBe(false)
  })

  it("un token de antes del plan sigue valiendo, con plan null (no invita, no tiene sedes), hasta la próxima revalidación", async () => {
    const { token, actor } = await leerSesion(tokenDeProfesional(4, { role: "owner", memberId: undefined }))

    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
    expect(token.plan).toBeUndefined()
    expect(actor).toMatchObject({ rol: "owner", plan: null })
    expect(puedeInvitarAlEquipo(actor)).toBe(false)
    expect(puedeGestionarSedes(actor)).toBe(false)
  })

  it("al quedarse sin negocio, el token pierde también el plan", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(usuarioMiembro("worker", { memberships: [] }))

    const { token } = await leerSesion(tokenDeProfesional(6, { plan: "equipo" }))

    expect(token.plan).toBeNull()
  })

  it("la consulta pide el plan del negocio propio y el de cada membresía: se repone de la base en cada revalidación", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(usuarioMiembro("worker"))

    await leerSesion(tokenDeProfesional(6))

    const { include } = prismaMock.user.findUnique.mock.calls[0][0]
    expect(include.business.select.plan).toBe(true)
    expect(include.memberships.select.business.select.plan).toBe(true)
  })

  it("el login con credenciales lleva el plan que devolvió `authorize`", async () => {
    const { jwt } = await callbacks()
    const token = (await jwt!({
      token: { email: "carla@x.com" },
      user: { id: "usuario-1", name: "Carla", email: "carla@x.com", role: "owner", businessId: "negocio-1", plan: "independiente", memberId: null },
      account: { provider: "credentials", type: "credentials", providerAccountId: "usuario-1" },
      trigger: "signIn",
    } as unknown as Parameters<NonNullable<typeof jwt>>[0])) as JWT

    expect(token.plan).toBe("independiente")
  })

  it("el login con credenciales no guarda un plan que no es de la lista", async () => {
    const { jwt } = await callbacks()
    const token = (await jwt!({
      token: { email: "carla@x.com" },
      user: { id: "usuario-1", name: "Carla", email: "carla@x.com", role: "owner", businessId: "negocio-1", plan: "pro", memberId: null },
      account: { provider: "credentials", type: "credentials", providerAccountId: "usuario-1" },
      trigger: "signIn",
    } as unknown as Parameters<NonNullable<typeof jwt>>[0])) as JWT

    expect(token.plan).toBeNull()
  })

  it("el login con Google arma el plan desde la base", async () => {
    const { jwt } = await callbacks()
    prismaMock.user.findUnique.mockResolvedValueOnce(
      usuarioMiembro("worker", { business: { ...negocio, type: "salon", plan: "independiente" }, memberships: [] })
    )

    const token = (await jwt!({
      token: { email: "carla@x.com" },
      user: { id: "g-1", email: "carla@x.com" },
      account: cuentaGoogle,
      trigger: "signIn",
    } as unknown as Parameters<NonNullable<typeof jwt>>[0])) as JWT

    expect(token.plan).toBe("independiente")
    expect(token.businessId).toBe("negocio-1")
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

async function authorize(credenciales: Record<string, string>) {
  const { authOptions } = await import("./auth")
  const proveedor = authOptions.providers.find((p) => p.id === "credentials") as unknown as {
    options?: { authorize: (c: Record<string, string>) => Promise<unknown> }
    authorize: (c: Record<string, string>) => Promise<unknown>
  }
  return (proveedor.options?.authorize ?? proveedor.authorize)(credenciales)
}

describe("entrar con Google (M1)", () => {
  beforeEach(() => vi.clearAllMocks())

  async function entrarConGoogle(profile: Record<string, unknown>) {
    const { signIn } = await callbacks()
    return signIn!({
      user: { id: "g-1", name: "Carla", email: "carla@x.com" },
      account: cuentaGoogle,
      profile: { email: "carla@x.com", ...profile },
    } as unknown as Parameters<NonNullable<typeof signIn>>[0])
  }

  it("rechaza un email que Google no verificó, sin buscar ni crear la cuenta", async () => {
    expect(await entrarConGoogle({ email_verified: false })).toBe(false)
    expect(await entrarConGoogle({})).toBe(false)
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.user.create).not.toHaveBeenCalled()
  })

  it("no vincula una cuenta con contraseña: manda a entrar con correo y contraseña", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "usuario-1", email: "carla@x.com", password: "hash-bcrypt" })

    const resultado = await entrarConGoogle({ email_verified: true })

    expect(resultado).toBe("/iniciar-sesion?error=CuentaConContrasena")
    expect(prismaMock.user.create).not.toHaveBeenCalled()
  })

  it("una cuenta creada con Google (sin contraseña) sigue entrando igual", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "usuario-1", email: "carla@x.com", password: "" })

    expect(await entrarConGoogle({ email_verified: true })).toBe(true)
    expect(prismaMock.user.create).not.toHaveBeenCalled()
  })

  it("un email verificado sin cuenta crea la cuenta sin contraseña", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null)
    prismaMock.user.create.mockResolvedValueOnce({ id: "nuevo" })

    expect(await entrarConGoogle({ email_verified: true })).toBe(true)
    expect(prismaMock.user.create).toHaveBeenCalledWith({
      data: { name: "Carla", email: "carla@x.com", password: "" },
    })
  })
})

describe("emails de cuenta normalizados en el login (B4)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("credenciales: busca la cuenta por el email sin espacios y en minúsculas", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null)

    await authorize({ email: "  Carla@X.COM ", password: "loquesea1" })

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "carla@x.com" } })
    )
  })

  it("Google: busca y crea la cuenta con el email normalizado", async () => {
    const { signIn } = await callbacks()
    prismaMock.user.findUnique.mockResolvedValueOnce(null)
    prismaMock.user.create.mockResolvedValueOnce({ id: "nuevo" })

    const resultado = await signIn!({
      user: { id: "g-1", name: "Carla", email: "Carla@X.com" },
      account: cuentaGoogle,
      profile: { email: "Carla@X.com", email_verified: true },
    } as unknown as Parameters<NonNullable<typeof signIn>>[0])

    expect(resultado).toBe(true)
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { email: "carla@x.com" } })
    expect(prismaMock.user.create.mock.calls[0][0].data.email).toBe("carla@x.com")
  })

  it("Google: el token se arma buscando por el email normalizado", async () => {
    const { jwt } = await callbacks()
    prismaMock.user.findUnique.mockResolvedValueOnce(null)

    await jwt!({
      token: { email: "Carla@X.com" },
      user: { id: "g-1", email: "Carla@X.com" },
      account: cuentaGoogle,
      trigger: "signIn",
    } as unknown as Parameters<NonNullable<typeof jwt>>[0])

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "carla@x.com" } })
    )
  })
})

// ─── Contextos: una cuenta en varios negocios (PRODUCTO.md, sección 5) ──────

const salonPropio = { id: "negocio-3", name: "Salón Tres", slug: "salon-tres", type: "salon", plan: "independiente" }
const clinica = { id: "negocio-1", name: "Clínica Aurora", slug: "clinica-aurora", type: "odontologia", plan: "equipo" }

/** Dueña del Salón Tres, profesional en la Clínica y además profesional en su propio salón. */
function dueñaEnVariosNegocios(extra: Record<string, unknown> = {}) {
  return usuarioMiembro("worker", {
    business: salonPropio,
    memberships: [
      { id: "miembro-clinica", role: "worker", business: clinica },
      { id: "miembro-propio", role: "worker", business: salonPropio },
    ],
    ...extra,
  })
}

/** Corre `jwt` como lo hace NextAuth en un `update(datos)` del navegador. */
async function actualizarSesion(token: JWT, datos: unknown) {
  const { jwt, session } = await callbacks()
  const nuevo = (await jwt!({ token, trigger: "update", session: datos } as unknown as Parameters<NonNullable<typeof jwt>>[0])) as JWT
  const sesion = await session!({
    session: { user: { name: "Carla", email: "carla@x.com" }, expires: "" },
    token: nuevo,
  } as unknown as Parameters<NonNullable<typeof session>>[0])
  return { token: nuevo, sesion: sesion as Session, actor: actorDeSesion(sesion as never) }
}

describe("contextos de la cuenta (lib/auth.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(AHORA)
  })

  afterEach(() => {
    vi.useRealTimers()
    prismaMock.user.findUnique.mockReset()
  })

  it("con un solo contexto entra directo, sin elegir", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(usuarioMiembro("worker"))

    const { token, actor } = await leerSesion(tokenDeProfesional(6, { contexto: undefined }))

    expect(actor).toEqual({ rol: "worker", businessId: "negocio-1", memberId: "miembro-1", plan: "equipo" })
    expect(token.contexto).toBe("miembro:miembro-1")
    expect(token.contextos).toBe(1)
  })

  it("con varios contextos y ninguno elegido, la sesión queda sin negocio hasta que elija (falla cerrado)", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(dueñaEnVariosNegocios())

    const { token, actor } = await leerSesion(tokenDeProfesional(6, { contexto: undefined }))

    expect(actor).toBeNull()
    expect(token.businessId).toBeFalsy()
    expect(token.memberId).toBeFalsy()
    expect(token.contexto).toBeNull()
    expect(token.contextos).toBe(3)
    expect(token.tieneNegocioPropio).toBe(true)
  })

  it("la dueña invitada como profesional en su propio negocio tiene dos contextos en el mismo negocio", async () => {
    const usuario = dueñaEnVariosNegocios()

    prismaMock.user.findUnique.mockResolvedValueOnce(usuario)
    const comoDueña = await actualizarSesion(tokenDeProfesional(1, { contexto: null }), { contexto: "dueño:negocio-3" })
    expect(comoDueña.actor).toEqual({ rol: "owner", businessId: "negocio-3", memberId: null, rubro: "salon", plan: "independiente" })

    prismaMock.user.findUnique.mockResolvedValueOnce(usuario)
    const comoProfesional = await actualizarSesion(comoDueña.token, { contexto: "miembro:miembro-propio" })
    // Profesional a todos los efectos: rol worker y su memberId, en su propio negocio.
    expect(comoProfesional.actor).toEqual({ rol: "worker", businessId: "negocio-3", memberId: "miembro-propio", rubro: "salon", plan: "independiente" })
    expect(comoProfesional.sesion.user.contexto).toBe("miembro:miembro-propio")
    expect(comoProfesional.sesion.user.contextos).toBe(3)
  })

  it("cambiar de contexto se revalida contra la base en el acto, aunque no hayan pasado 5 minutos", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(dueñaEnVariosNegocios())

    const { actor } = await actualizarSesion(tokenDeProfesional(0, { contexto: "dueño:negocio-3" }), { contexto: "miembro:miembro-clinica" })

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "usuario-1" } }))
    expect(actor).toEqual({ rol: "worker", businessId: "negocio-1", memberId: "miembro-clinica", rubro: "odontologia", plan: "equipo" })
  })

  it.each([
    ["una membresía de otra cuenta", "miembro:miembro-de-otra"],
    ["el negocio de otra dueña", "dueño:negocio-ajeno"],
    ["un id inventado", "admin:negocio-1"],
    ["algo que no es texto", { businessId: "negocio-ajeno", rol: "owner" }],
  ])("pedir %s se rechaza: la sesión sigue con su contexto", async (_caso, pedido) => {
    prismaMock.user.findUnique.mockResolvedValueOnce(dueñaEnVariosNegocios())

    const { token, actor } = await actualizarSesion(tokenDeProfesional(0, { contexto: "miembro:miembro-clinica" }), { contexto: pedido })

    expect(actor).toEqual({ rol: "worker", businessId: "negocio-1", memberId: "miembro-clinica", rubro: "odontologia", plan: "equipo" })
    expect(token.contexto).toBe("miembro:miembro-clinica")
  })

  it("lo que mande el navegador además del contexto (negocio, rol, membresía) no se usa", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(dueñaEnVariosNegocios())

    const { actor } = await actualizarSesion(tokenDeProfesional(0, { contexto: "miembro:miembro-clinica" }), {
      businessId: "negocio-ajeno",
      role: "owner",
      memberId: "miembro-ajeno",
    })

    expect(actor).toEqual({ rol: "worker", businessId: "negocio-1", memberId: "miembro-clinica", rubro: "odontologia", plan: "equipo" })
  })

  it("el plan que mande el navegador con update() no se usa: manda la base", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(dueñaEnVariosNegocios())

    const { token, actor } = await actualizarSesion(tokenDeProfesional(0, { contexto: "dueño:negocio-3", plan: "independiente" }), {
      contexto: "dueño:negocio-3",
      plan: "equipo",
    })

    expect(token.plan).toBe("independiente")
    expect(actor).toMatchObject({ rol: "owner", businessId: "negocio-3", plan: "independiente" })
    expect(puedeInvitarAlEquipo(actor)).toBe(false)
  })

  it("al cambiar de contexto con update(), el plan cambia con el negocio, nunca queda el del anterior", async () => {
    const usuario = dueñaEnVariosNegocios()

    prismaMock.user.findUnique.mockResolvedValueOnce(usuario)
    const enSalon = await actualizarSesion(tokenDeProfesional(0, { contexto: null }), { contexto: "dueño:negocio-3" })
    expect(enSalon.sesion.user.plan).toBe("independiente")

    prismaMock.user.findUnique.mockResolvedValueOnce(usuario)
    const enClinica = await actualizarSesion(enSalon.token, { contexto: "miembro:miembro-clinica" })
    expect(enClinica.sesion.user.plan).toBe("equipo")
    expect(enClinica.actor).toMatchObject({ businessId: "negocio-1", plan: "equipo" })

    prismaMock.user.findUnique.mockResolvedValueOnce(usuario)
    const deVueltaEnSalon = await actualizarSesion(enClinica.token, { contexto: "dueño:negocio-3" })
    expect(deVueltaEnSalon.sesion.user.plan).toBe("independiente")
  })

  it("si borran la membresía del contexto elegido, falla cerrado: sin negocio y a elegir de nuevo", async () => {
    // Quedan dos contextos (dueña y profesional en su salón): no se adivina cuál.
    prismaMock.user.findUnique.mockResolvedValueOnce(
      dueñaEnVariosNegocios({ memberships: [{ id: "miembro-propio", role: "worker", business: salonPropio }] })
    )

    const { token, actor } = await leerSesion(tokenDeProfesional(6, { contexto: "miembro:miembro-clinica" }))

    expect(actor).toBeNull()
    expect(token.businessId).toBeFalsy()
    expect(token.memberId).toBeFalsy()
    expect(token.rubro).toBeNull()
    expect(token.contexto).toBeNull()
    expect(token.contextos).toBe(2)
  })

  it("Ana en A y B trabajando en A: si borran su membresía en A, queda sin negocio y a elegir, nunca pasa sola a B", async () => {
    // A = Barbería Uno (miembro-a), B = Spa Dos (miembro-b). Tras borrar A le queda sólo B.
    prismaMock.user.findUnique.mockResolvedValueOnce(
      usuarioMiembro("worker", { memberships: [{ id: "miembro-b", role: "admin", business: otroNegocio }] })
    )

    const { token, actor } = await leerSesion(
      tokenDeProfesional(6, { contexto: "miembro:miembro-a", memberId: "miembro-a", contextos: 2 })
    )

    expect(actor).toBeNull()
    expect(token.businessId).toBeFalsy()
    expect(token.memberId).toBeFalsy()
    expect(token.role).toBeFalsy()
    expect(token.contexto).toBeNull()
    // Sigue identificando a la cuenta: el proxy la manda a elegir (le queda B).
    expect(token.id).toBe("usuario-1")
    expect(token.contextos).toBe(1)
  })

  it("lo mismo al cambiar de contexto con update(): un pedido inválido no rescata un contexto que dejó de existir", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(
      usuarioMiembro("worker", { memberships: [{ id: "miembro-b", role: "admin", business: otroNegocio }] })
    )

    const { actor } = await actualizarSesion(tokenDeProfesional(0, { contexto: "miembro:miembro-a" }), { contexto: "miembro:ajeno" })

    expect(actor).toBeNull()
  })

  it("tras quedar sin negocio, elegir el que le queda funciona como siempre", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(
      usuarioMiembro("worker", { memberships: [{ id: "miembro-b", role: "admin", business: otroNegocio }] })
    )

    const { actor } = await actualizarSesion(tokenDeProfesional(0, { contexto: null }), { contexto: "miembro:miembro-b" })

    expect(actor).toEqual({ rol: "admin", businessId: "negocio-2", memberId: "miembro-b", plan: "equipo" })
  })

  it("si deja de ser dueña, el contexto de dueña deja de valer aunque el token lo traiga", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(
      usuarioMiembro("worker", {
        business: null,
        memberships: [
          { id: "miembro-clinica", role: "worker", business: clinica },
          { id: "miembro-otro", role: "admin", business: otroNegocio },
        ],
      })
    )

    const { actor, token } = await leerSesion(tokenDeProfesional(6, { contexto: "dueño:negocio-3", role: "owner", businessId: "negocio-3", memberId: null }))

    expect(actor).toBeNull()
    expect(token.tieneNegocioPropio).toBe(false)
  })

  it("aislamiento: en cada contexto el par negocio y membresía es del mismo negocio, y nunca el de otro contexto", async () => {
    const usuario = dueñaEnVariosNegocios()
    const contextos = ["dueño:negocio-3", "miembro:miembro-clinica", "miembro:miembro-propio"]
    const esperados = {
      "dueño:negocio-3": { businessId: "negocio-3", memberId: null },
      "miembro:miembro-clinica": { businessId: "negocio-1", memberId: "miembro-clinica" },
      "miembro:miembro-propio": { businessId: "negocio-3", memberId: "miembro-propio" },
    } as const

    let token = tokenDeProfesional(0, { contexto: "dueño:negocio-3" })
    for (const id of [...contextos, ...contextos.slice().reverse()]) {
      prismaMock.user.findUnique.mockResolvedValueOnce(usuario)
      const resultado = await actualizarSesion(token, { contexto: id })
      token = resultado.token
      expect(resultado.actor).toMatchObject(esperados[id as keyof typeof esperados])
    }
  })

  it("al revocar la sesión no queda ningún contexto", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null)

    const { token } = await leerSesion(tokenDeProfesional(6, { contexto: "miembro:miembro-1", contextos: 2 }))

    expect(token.contexto).toBeNull()
    expect(token.contextos).toBe(0)
  })
})

describe("límite de intentos de login dentro de authorize (A1)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockVerificarLimite.mockImplementation(async () => ({ permitido: true, restantes: 10 }))
  })

  afterEach(() => prismaMock.user.findUnique.mockReset())

  async function authorizeCon(credenciales: Record<string, string>, cabeceras: Record<string, string> = {}) {
    const { authOptions } = await import("./auth")
    const proveedor = authOptions.providers.find((p) => p.id === "credentials") as unknown as {
      options?: { authorize: (c: Record<string, string>, req: unknown) => Promise<unknown> }
      authorize: (c: Record<string, string>, req: unknown) => Promise<unknown>
    }
    return (proveedor.options?.authorize ?? proveedor.authorize)(credenciales, { headers: cabeceras })
  }

  it("cuenta por IP (de las cabeceras del pedido) y por cuenta (hash del correo normalizado, nunca en claro)", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null)

    await authorizeCon({ email: " Carla@X.com ", password: "loquesea1" }, { "x-real-ip": "203.0.113.7" })

    const claves = mockVerificarLimite.mock.calls.map((llamada) => llamada[1] as string)
    const { hashDeToken } = await import("@/lib/tokens")
    // La IP en el balde `login`; la cuenta en el suyo, más amplio (`loginPorCuenta`).
    expect(mockVerificarLimite).toHaveBeenCalledWith("login", "authorize:ip:203.0.113.7")
    expect(mockVerificarLimite).toHaveBeenCalledWith("loginPorCuenta", `authorize:cuenta:${hashDeToken("carla@x.com")}`)
    expect(mockVerificarLimite).toHaveBeenCalledTimes(2)
    expect(claves.join(" ")).not.toContain("carla")
  })

  it.each([
    ["por IP", "authorize:ip:"],
    ["por cuenta", "authorize:cuenta:"],
  ])("pasado el límite %s, lanza DemasiadosIntentos sin tocar la base ni comparar la contraseña", async (_caso, prefijo) => {
    mockVerificarLimite.mockImplementation(async (...args: unknown[]) => ({
      permitido: !String(args[1]).startsWith(prefijo),
      restantes: 0,
    }))

    await expect(authorizeCon({ email: "carla@x.com", password: "loquesea1" })).rejects.toThrow("DemasiadosIntentos")
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  })

  it("sin cuenta compara igual contra un hash ficticio: tarda lo mismo que una contraseña equivocada", async () => {
    const bcrypt = (await import("bcryptjs")).default
    const comparar = vi.spyOn(bcrypt, "compare")
    prismaMock.user.findUnique.mockResolvedValueOnce(null)

    expect(await authorizeCon({ email: "nadie@x.com", password: "loquesea1" })).toBeNull()

    expect(comparar).toHaveBeenCalledTimes(1)
    expect(String(comparar.mock.calls[0][1])).toMatch(/^\$2[aby]\$12\$/)
    comparar.mockRestore()
  })

  it("con varios contextos, authorize no elige ninguno: la cuenta elige al entrar", async () => {
    const bcrypt = (await import("bcryptjs")).default
    const comparar = vi.spyOn(bcrypt, "compare").mockImplementation(async () => true)
    prismaMock.user.findUnique.mockResolvedValueOnce(dueñaEnVariosNegocios())

    const usuario = (await authorizeCon({ email: "carla@x.com", password: "buena" })) as Record<string, unknown>

    expect(usuario).toMatchObject({ id: "usuario-1", contexto: null, contextos: 3, tieneNegocioPropio: true, businessId: null })
    comparar.mockRestore()
  })
})
