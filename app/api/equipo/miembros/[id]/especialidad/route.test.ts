import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { conId, datosBase, pedido, sesiones } from "@/pruebas/datos"

/**
 * La especialidad de un profesional, desde Equipo. Dueño y encargado; el
 * miembro, del negocio de la sesión (lo ajeno es 404 y no escribe nada).
 */

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

const URL = (id: string) => `http://localhost/api/equipo/miembros/${id}/especialidad`

async function guardar(sesion: unknown, id: string, cuerpo: unknown) {
  const { PUT } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const respuesta = await PUT(pedido(URL(id), cuerpo), conId(id))
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const especialidadDe = (id: string) => base.buscar("businessMember", { id })[0]?.especialidad ?? null

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar(datosBase())
})

describe("PUT /api/equipo/miembros/[id]/especialidad", () => {
  it("la dueña y el encargado la guardan, sin espacios de más", async () => {
    expect(await guardar(sesiones.dueña, "m-carla", { especialidad: "  Colorista " })).toEqual({
      status: 200,
      cuerpo: { especialidad: "Colorista" },
    })
    expect(especialidadDe("m-carla")).toBe("Colorista")
    expect((await guardar(sesiones.encargado, "m-pedro", { especialidad: "Barbero" })).status).toBe(200)
    expect(especialidadDe("m-pedro")).toBe("Barbero")
  })

  it("vacía, la borra", async () => {
    await guardar(sesiones.dueña, "m-carla", { especialidad: "Colorista" })
    expect((await guardar(sesiones.dueña, "m-carla", { especialidad: "" })).cuerpo).toEqual({ especialidad: null })
    expect(especialidadDe("m-carla")).toBeNull()
  })

  it("más de 60 caracteres o sin el campo: 400 y no escribe", async () => {
    expect((await guardar(sesiones.dueña, "m-carla", { especialidad: "x".repeat(61) })).status).toBe(400)
    expect((await guardar(sesiones.dueña, "m-carla", {})).status).toBe(400)
    expect(especialidadDe("m-carla")).toBeNull()
  })

  it("un miembro de otro negocio o que no existe es 404 y no escribe nada", async () => {
    expect((await guardar(sesiones.dueña, "m-ajeno", { especialidad: "Colorista" })).status).toBe(404)
    expect(especialidadDe("m-ajeno")).toBeNull()
    expect((await guardar(sesiones.dueña, "m-no-existe", { especialidad: "Colorista" })).status).toBe(404)
  })

  it("el profesional (ni la suya) y sin sesión: 401", async () => {
    expect((await guardar(sesiones.carla, "m-carla", { especialidad: "Colorista" })).status).toBe(401)
    expect((await guardar(null, "m-carla", { especialidad: "Colorista" })).status).toBe(401)
    expect(especialidadDe("m-carla")).toBeNull()
  })
})
