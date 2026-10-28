import { describe, it, expect, vi, beforeEach } from "vitest"
import { crearBaseFalsa } from "@/pruebas/base-falsa"
import { NEGOCIO, OTRO_NEGOCIO, datosBase, pedido, sesiones } from "@/pruebas/datos"

const mockGetServerSession = vi.fn()

vi.mock("next-auth", () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const base = crearBaseFalsa()

vi.mock("@/lib/prisma", () => ({ prisma: base.prisma }))

async function guardar(sesion: unknown, cuerpo: unknown) {
  const { PUT } = await import("./route")
  mockGetServerSession.mockResolvedValueOnce(sesion)
  const respuesta = await PUT(pedido("http://localhost/api/configuracion/plazo-de-cambios", cuerpo))
  return { status: respuesta.status, cuerpo: await respuesta.json() }
}

const plazoDe = (id: string) => base.buscar("business", { id })[0].cancelacionHorasAntes

beforeEach(() => {
  vi.clearAllMocks()
  base.reiniciar(datosBase())
})

describe("PUT /api/configuracion/plazo-de-cambios", () => {
  it("dueño y encargado lo cambian en su negocio, y sólo en el suyo", async () => {
    expect(await guardar(sesiones.dueña, { horas: 48 })).toEqual({ status: 200, cuerpo: { horas: 48 } })
    expect(plazoDe(NEGOCIO)).toBe(48)
    expect((await guardar(sesiones.encargado, { horas: 0 })).status).toBe(200)
    expect(plazoDe(NEGOCIO)).toBe(0)
    expect(plazoDe(OTRO_NEGOCIO)).toBe(24)
  })

  it("el profesional y sin sesión: 401 sin cambiar nada", async () => {
    expect((await guardar(sesiones.carla, { horas: 2 })).status).toBe(401)
    expect((await guardar(null, { horas: 2 })).status).toBe(401)
    expect(plazoDe(NEGOCIO)).toBe(24)
  })

  it.each([[{ horas: -1 }], [{ horas: 73 }], [{ horas: 2.5 }], [{ horas: "24" }], [{}], [undefined]])(
    "fuera de 0–72 o no entero (%j): 400",
    async (cuerpo) => {
      const { status, cuerpo: respuesta } = await guardar(sesiones.dueña, cuerpo)
      expect(status).toBe(400)
      expect(respuesta.error).toMatch(/de 0 a 72/)
      expect(plazoDe(NEGOCIO)).toBe(24)
    }
  )
})
