import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, datosBase, sesiones } from "@/pruebas/datos"

/**
 * GET /api/equipo/miembros: el selector de profesional de la agenda. Ofrece
 * sólo a quienes atienden, como la reserva pública (#140): el encargado no.
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({
  get prisma() {
    return base.prisma
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar(datosBase())
})

async function leer(sesion: unknown) {
  const { GET } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const respuesta = await GET()
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

describe("GET /api/equipo/miembros", () => {
  it("sólo quienes atienden, de este negocio: ni el encargado ni el profesional de otro negocio", async () => {
    const { status, cuerpo } = await leer(sesiones.dueña)
    expect(status).toBe(200)
    expect(cuerpo).toEqual({
      miembros: [
        { id: "m-carla", nombre: "Carla Profesional", rol: "worker" },
        { id: "m-pedro", nombre: "Pedro Profesional", rol: "worker" },
      ],
    })
  })

  it("el encargado lo pide igual, y tampoco se ve a sí mismo", async () => {
    const { status, cuerpo } = await leer(sesiones.encargado)
    expect(status).toBe(200)
    expect(cuerpo.miembros.map((miembro: { id: string }) => miembro.id)).toEqual(["m-carla", "m-pedro"])
  })

  it("acota por el negocio de la sesión", async () => {
    await leer(sesiones.dueña)
    expect(base.prisma.businessMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ businessId: NEGOCIO }) })
    )
  })

  it("el profesional y sin sesión: 401", async () => {
    expect((await leer(sesiones.carla)).status).toBe(401)
    expect((await leer(null)).status).toBe(401)
  })
})
