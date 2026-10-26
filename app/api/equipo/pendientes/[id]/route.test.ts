import { describe, it, expect, vi, beforeEach } from "vitest"
import { createHash } from "node:crypto"
import type { NextRequest } from "next/server"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

vi.mock("@/lib/email", () => ({
  enviarInvitacionTrabajador: vi.fn().mockResolvedValue(undefined),
}))

const mockVerificarLimite = vi.fn()
vi.mock("@/lib/rate-limit", () => ({
  verificarLimite: (...args: unknown[]) => mockVerificarLimite(...args),
}))

interface Invitacion {
  id: string
  businessId: string
  email: string
  name: string
  role: string
  tokenHash: string
  expiresAt: Date
  acceptedAt: Date | null
  createdAt: Date
}

/**
 * Las invitaciones en memoria. El `where` se evalúa de verdad (y lanza ante
 * una clave que no conoce): así un test de aislamiento mira qué queda escrito,
 * no la forma de la consulta.
 */
let invitaciones: Invitacion[] = []

const CLAVES = new Set(["id", "businessId", "acceptedAt"])

function coincide(invitacion: Invitacion, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([clave, valor]) => {
    if (!CLAVES.has(clave)) throw new Error(`where con una clave que el mock no conoce: ${clave}`)
    return invitacion[clave as keyof Invitacion] === valor
  })
}

function proyectar(invitacion: Invitacion, select: Record<string, boolean>) {
  return Object.fromEntries(Object.keys(select).filter((clave) => select[clave]).map((clave) => [clave, invitacion[clave as keyof Invitacion]]))
}

const prismaMock = {
  workerInvitation: {
    findFirst: vi.fn(async ({ where, select }: { where: Record<string, unknown>; select: Record<string, boolean> }) => {
      const encontrada = invitaciones.find((invitacion) => coincide(invitacion, where))
      return encontrada ? proyectar(encontrada, select) : null
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Invitacion> }) => {
      const tocadas = invitaciones.filter((invitacion) => coincide(invitacion, where))
      tocadas.forEach((invitacion) => Object.assign(invitacion, data))
      return { count: tocadas.length }
    }),
    deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const antes = invitaciones.length
      invitaciones = invitaciones.filter((invitacion) => !coincide(invitacion, where))
      return { count: antes - invitaciones.length }
    }),
  },
  business: { findUnique: vi.fn(async () => ({ name: "Salón Uno" })) },
}

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

const sesiones = {
  dueña: { user: { id: "u-duena", role: "owner", businessId: "negocio-1", businessName: "Salón Uno" } },
  encargado: { user: { id: "u-enc", role: "admin", businessId: "negocio-1", businessName: "Salón Uno", memberId: "m-enc" } },
  profesional: { user: { id: "u-pro", role: "worker", businessId: "negocio-1", businessName: "Salón Uno", memberId: "m-pro" } },
  dueñoAjeno: { user: { id: "u-otro", role: "owner", businessId: "negocio-2", businessName: "Salón Dos" } },
}

const DIA = 24 * 60 * 60 * 1000
const ahora = Date.now()

function invitacion(id: string, datos: Partial<Invitacion> = {}): Invitacion {
  return {
    id,
    businessId: "negocio-1",
    email: `${id}@correo.test`,
    name: `Persona ${id}`,
    role: "worker",
    tokenHash: `hash-viejo-${id}`,
    expiresAt: new Date(ahora + 3 * DIA),
    acceptedAt: null,
    createdAt: new Date(ahora - 4 * DIA),
    ...datos,
  }
}

const pedido = {} as NextRequest
const conId = (id: string) => ({ params: Promise.resolve({ id }) })
const copia = () => structuredClone(invitaciones)

beforeEach(() => {
  vi.clearAllMocks()
  mockVerificarLimite.mockResolvedValue({ permitido: true, restantes: 2 })
  invitaciones = [
    invitacion("vigente"),
    invitacion("vencida", { expiresAt: new Date(ahora - DIA) }),
    invitacion("aceptada", { acceptedAt: new Date(ahora - DIA) }),
    invitacion("ajena", { businessId: "negocio-2" }),
  ]
})

describe("POST /api/equipo/pendientes/[id]/reenviar", () => {
  it.each([
    ["la dueña", sesiones.dueña],
    ["el encargado", sesiones.encargado],
  ])("%s reenvía: enlace nuevo, siete días más, y el correo sale con ese enlace", async (_quien, sesion) => {
    const { POST } = await import("./reenviar/route")
    const { enviarInvitacionTrabajador } = await import("@/lib/email")

    mockGetServerSession.mockResolvedValueOnce(sesion)

    const res = await POST(pedido, conId("vencida"))
    const datos = await res.json()

    expect(res.status).toBe(200)
    const guardada = invitaciones.find((i) => i.id === "vencida")!
    const enlace: string = vi.mocked(enviarInvitacionTrabajador).mock.calls[0][0].enlaceAceptar
    const token = enlace.split("/unirse/")[1]
    expect(guardada.tokenHash).toBe(createHash("sha256").update(token).digest("hex"))
    expect(guardada.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6.9 * DIA)
    expect(vi.mocked(enviarInvitacionTrabajador).mock.calls[0][0]).toMatchObject({
      emailTrabajador: "vencida@correo.test",
      nombreTrabajador: "Persona vencida",
      nombreNegocio: "Salón Uno",
    })
    // Ni el token ni su hash salen en la respuesta.
    expect(JSON.stringify(datos)).not.toContain(token)
    expect(JSON.stringify(datos)).not.toContain(guardada.tokenHash)
    expect(datos.invitacion).toMatchObject({ id: "vencida", email: "vencida@correo.test" })
  })

  it("una vigente también se reenvía, y el enlace anterior deja de servir", async () => {
    const { POST } = await import("./reenviar/route")

    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const res = await POST(pedido, conId("vigente"))

    expect(res.status).toBe(200)
    expect(invitaciones.find((i) => i.id === "vigente")!.tokenHash).not.toBe("hash-viejo-vigente")
  })

  it.each([
    ["de otro negocio", "ajena"],
    ["ya aceptada", "aceptada"],
    ["que no existe", "no-existe"],
  ])("una invitación %s: 404, no 403, sin correo y sin escribir nada", async (_caso, id) => {
    const { POST } = await import("./reenviar/route")
    const { enviarInvitacionTrabajador } = await import("@/lib/email")

    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const antes = copia()

    const res = await POST(pedido, conId(id))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "Invitación no encontrada" })
    expect(invitaciones).toEqual(antes)
    expect(enviarInvitacionTrabajador).not.toHaveBeenCalled()
  })

  it("el dueño del otro negocio no llega a las de este, y sí a la suya", async () => {
    const { POST } = await import("./reenviar/route")

    mockGetServerSession.mockResolvedValueOnce(sesiones.dueñoAjeno)
    const resAjena = await POST(pedido, conId("vigente"))
    mockGetServerSession.mockResolvedValueOnce(sesiones.dueñoAjeno)
    const resPropia = await POST(pedido, conId("ajena"))

    expect(resAjena.status).toBe(404)
    expect(resPropia.status).toBe(200)
  })

  it.each([
    ["el profesional", sesiones.profesional],
    ["sin sesión", null],
  ])("%s recibe 401 y no toca nada", async (_quien, sesion) => {
    const { POST } = await import("./reenviar/route")

    mockGetServerSession.mockResolvedValueOnce(sesion)
    const antes = copia()

    const res = await POST(pedido, conId("vigente"))

    expect(res.status).toBe(401)
    expect(invitaciones).toEqual(antes)
    expect(prismaMock.workerInvitation.findFirst).not.toHaveBeenCalled()
  })

  it("pasado el límite de reenvíos: 429, sin correo y el enlace sigue siendo el de antes", async () => {
    const { POST } = await import("./reenviar/route")
    const { enviarInvitacionTrabajador } = await import("@/lib/email")

    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    mockVerificarLimite.mockResolvedValueOnce({ permitido: false, restantes: 0 })
    const antes = copia()

    const res = await POST(pedido, conId("vigente"))

    expect(res.status).toBe(429)
    expect(invitaciones).toEqual(antes)
    expect(enviarInvitacionTrabajador).not.toHaveBeenCalled()
    // Cuenta por negocio y casilla de destino, en su propio balde.
    expect(mockVerificarLimite).toHaveBeenCalledWith("reenvioDeInvitacion", "negocio-1:vigente@correo.test")
  })
})

describe("DELETE /api/equipo/pendientes/[id]", () => {
  it.each([
    ["la dueña", sesiones.dueña],
    ["el encargado", sesiones.encargado],
  ])("%s anula una invitación pendiente: desaparece, y las demás quedan", async (_quien, sesion) => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesion)

    const res = await DELETE(pedido, conId("vigente"))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ mensaje: "Invitación anulada" })
    expect(invitaciones.map((i) => i.id)).toEqual(["vencida", "aceptada", "ajena"])
  })

  it("también una vencida", async () => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)

    const res = await DELETE(pedido, conId("vencida"))

    expect(res.status).toBe(200)
    expect(invitaciones.map((i) => i.id)).not.toContain("vencida")
  })

  it.each([
    ["de otro negocio", "ajena"],
    ["ya aceptada", "aceptada"],
    ["que no existe", "no-existe"],
  ])("una invitación %s: 404, no 403, y no se borra nada", async (_caso, id) => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesiones.dueña)
    const antes = copia()

    const res = await DELETE(pedido, conId(id))

    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: "Invitación no encontrada" })
    expect(invitaciones).toEqual(antes)
  })

  it.each([
    ["el profesional", sesiones.profesional],
    ["sin sesión", null],
  ])("%s recibe 401 y no borra nada", async (_quien, sesion) => {
    const { DELETE } = await import("./route")

    mockGetServerSession.mockResolvedValueOnce(sesion)
    const antes = copia()

    const res = await DELETE(pedido, conId("vigente"))

    expect(res.status).toBe(401)
    expect(invitaciones).toEqual(antes)
    expect(prismaMock.workerInvitation.deleteMany).not.toHaveBeenCalled()
  })
})
